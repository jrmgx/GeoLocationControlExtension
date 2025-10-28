function onError(error) {
  console.error(error);
}

function buildGeolocationPosition(lat, lng, speed) {
  return {
    timestamp: Date.now(),
    coords: {
      latitude: lat,
      longitude: lng,
      altitude: null,
      accuracy: 1, // TODO?
      altitudeAccuracy: null,
      heading: parseInt('NaN', 10),
      velocity: null,
			speed: speed ? (speed * 1000) / 3600 : 0, // convert km/h to m/s
    },
  };
}

const contentScriptConnections = [];
let currentPosition = { lat: 48.853394456522416, lng: 2.3487943410873418, speed: 0 }; // Paris
// id (timestamps is ms) => { lat, lng }
const points = {};
let pref = { speed: 5.5, loop: false };

const reload = () => {
  browser.storage.local.get().then((results) => {
    const storageKeys = Object.keys(results);
    let first = true;
    for (const storageKey of storageKeys) {
      const storageValue = results[storageKey];
      if (storageKey === 'pref') {
        pref = storageValue;
        continue;
      }
      points[storageKey] = storageValue;
      if (first) {
        first = false;
        currentPosition = { lat: storageValue.lat, lng: storageValue.lng };
      }
    }
  }, onError);
};
reload();

browser.runtime.onConnect.addListener((connection) => {
  contentScriptConnections[connection.sender.tab.id] = connection;
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // This is sent by our extension page (map.js) to ask a reload/refresh from the storage
  if (request.request === 'update') {
    reload();
    return;
  }

  // This is sent by our extension page (map.js)
  // to set the current position (when moving is activated)
  if (request.request === 'setCurrentPosition') {
    currentPosition = {
      lat: request.fromPercentOfPath.latLng.lat,
      lng: request.fromPercentOfPath.latLng.lng,
			speed: request.speed || 0,
    };
    contentScriptConnections.forEach((connection) => {
      connection.postMessage({
        geolocationPosition: buildGeolocationPosition(currentPosition.lat, currentPosition.lng, currentPosition.speed),
      });
    });
  }

  // This is sent by our content script to get the current position
  if (request.request === 'request.geolocation.getCurrentPosition'
      || request.request === 'request.geolocation.watchPosition') {
    sendResponse({ geolocationPosition: buildGeolocationPosition(currentPosition.lat, currentPosition.lng, currentPosition.speed) });
    return true;
  }

  sendResponse({ success: true });
  return true; // This means that we used sendResponse
});

// Open a new tab with our extension page (map.html)
chrome.browserAction.onClicked.addListener((_) => {
  chrome.tabs.create({ url: browser.runtime.getURL('map.html') });
});
