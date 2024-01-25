function onError(error) {
  console.error(error);
}

// This is used to inject the code into the page context (different from content context)
// and then to communicate back and forth with the context page (then background page)
const script = document.createElement('script');
script.id = 'geo-location-control';
let isWatching = false;

script.addEventListener('request.geolocation.getCurrentPosition', () => {
  // Ask background page
  const sending = browser.runtime.sendMessage({ request: 'request.geolocation.getCurrentPosition' });
  sending.then((message) => {
    // We need to stringify the object so it loose the security context
    const e = new CustomEvent('response.geolocation.getCurrentPosition', { detail: JSON.stringify(message) });
    // Send to injected script
    script.dispatchEvent(e);
  }, onError);
});

script.addEventListener('request.geolocation.watchPosition', () => {
  isWatching = true;
  // Ask background page
  const sending = browser.runtime.sendMessage({ request: 'request.geolocation.watchPosition' });
  sending.then((message) => {
    const e = new CustomEvent('response.geolocation.watchPosition', { detail: JSON.stringify(message) });
    // Send to injected script
    script.dispatchEvent(e);
  }, onError);
});

script.addEventListener('request.geolocation.clearWatch', () => {
  isWatching = false;
});

const connection = browser.runtime.connect({ name: 'geo-location-control' });
connection.onMessage.addListener((message) => {
  if (!isWatching) return;
  // We need to stringify the object so it loose the security context
  const e = new CustomEvent('update.watchPosition', { detail: JSON.stringify(message) });
  // Send to injected script
  script.dispatchEvent(e);
});

// This will be converted to string and injected in the page
function injectMe() {
  let watchPositionHandler = null;
  const script = document.getElementById('geo-location-control');

  script.addEventListener('update.watchPosition', (e) => {
    if (!watchPositionHandler) return;
    try {
      const position = JSON.parse(e.detail).geolocationPosition;
      watchPositionHandler(position);
    } catch (error) {
      // The handler could be in a dirty state
      console.error(error);
    }
  });

  // Proxy of the API
  navigator.geolocation.getCurrentPosition = new Proxy(navigator.geolocation.getCurrentPosition, {
    apply(target, self, args) {
      const onResponse = args[0];
      // Send event to our content page
      script.dispatchEvent(new CustomEvent('request.geolocation.getCurrentPosition'));
      const responseEventListener = (e) => {
        const position = JSON.parse(e.detail).geolocationPosition;
        onResponse(position);
        script.removeEventListener('response.geolocation.getCurrentPosition', responseEventListener);
      };
      // Get response from event coming back from content page
      script.addEventListener('response.geolocation.getCurrentPosition', responseEventListener);
    },
  });

  // Proxy of the API
  navigator.geolocation.watchPosition = new Proxy(navigator.geolocation.watchPosition, {
    apply(target, self, args) {
      watchPositionHandler = args[0];
      // Send event to our content page
      script.dispatchEvent(new CustomEvent('request.geolocation.watchPosition'));
      const responseEventListener = (e) => {
        const position = JSON.parse(e.detail).geolocationPosition;
        watchPositionHandler(position);
        script.removeEventListener('response.geolocation.watchPosition', responseEventListener);
      };
      // Get response from event coming back from content page
      script.addEventListener('response.geolocation.watchPosition', responseEventListener);
    },
  });

  // Proxy of the API
  navigator.geolocation.clearWatch = new Proxy(navigator.geolocation.clearWatch, {
    apply(target, self, args) {
      watchPositionHandler = null;
      // Send event to our content page
      script.dispatchEvent(new CustomEvent('request.geolocation.clearWatch'));
    },
  });
}

script.textContent = `(${injectMe.toString()})()`;

if (document.contentType && document.contentType.endsWith('xml') === false) { // TODO update
  document.documentElement.append(script);
}
