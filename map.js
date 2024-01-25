function onError(error) {
  console.error(error);
}

const smallId = (id) => id.substring(id.length - 4);

// State
let path = null;
let started = null; // Date
let moveMarker = null;
let moveHandler = null;
let currentPositionInPercent = 0;
let totalDistance = 0;

// Bonjour Paris !
const map = L.map('map').setView([48.853394456522416, 2.3487943410873418], 16);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const markerGroup = L.featureGroup();
markerGroup.addTo(map);

if (path) {
  path.remove();
  path = null;
}

// browser.storage.local.clear();

// id (timestamps is ms) => { lat, lng }
const points = {};
let pref = {
  speed: 5.5,
  loop: false,
};

// HTML Elements
const pointsContainer = document.getElementById('points');
const inputSpeed = document.getElementById('input-speed');
const inputLoop = document.getElementById('input-loop');
const buttonStart = document.getElementById('button-start');

const stopMove = () => {
  if (moveHandler) {
    clearInterval(moveHandler);
  }
  moveHandler = null;
  if (moveMarker) {
    moveMarker.remove();
    moveMarker = null;
  }
  buttonStart.textContent = 'Start Move';
  started = null;
  // Reset state
  currentPositionInPercent = 0;
  totalDistance = 0;
};

const calculateNextPoint = () => {
  const distanceCoveredInOneSecond = (pref.speed * 1000) / 3600;
  currentPositionInPercent += (distanceCoveredInOneSecond / totalDistance);
  const fromPercentOfPath = L.GeometryUtil.interpolateOnLine(map, path, currentPositionInPercent);
  browser.runtime.sendMessage({ request: 'setCurrentPosition', fromPercentOfPath });
  // Update marker
  if (moveMarker) {
    moveMarker.remove();
    moveMarker = null;
  }
  moveMarker = L.circleMarker(fromPercentOfPath.latLng, { color: '#00F', radius: 5 }).addTo(map);

  // Over
  if (currentPositionInPercent >= 1) {
    if (pref.loop) {
      currentPositionInPercent = 0;
    } else {
      stopMove();
    }
  }
};

const startMove = () => {
  if (started) return;
  if (Object.keys(points).length <= 1) {
    alert('Please add multiples points before starting moving.');
    return;
  }
  if (!pref.speed) {
    alert('Please defined a speed before starting moving.');
    return;
  }
  if (path === null) {
    alert('Path is not up-to-date.');
    return;
  }
  started = new Date();
  buttonStart.textContent = 'Stop';
  totalDistance = L.GeometryUtil.length(path);
  moveHandler = setInterval(calculateNextPoint, 1000); // every second
};

function signalBackgroundScript() {
  // Ask the background page to refresh/reload
  browser.runtime.sendMessage({ request: 'update' });
}

// Save point into storage
function savePoint(id, value) {
  browser.storage.local.set({ [id]: value }).then(() => {}, onError);
  signalBackgroundScript();
}

// Delete point from storage
function deletePoint(id) {
  browser.storage.local.remove(id).then(() => {}, onError);
  signalBackgroundScript();
}

function updatePath() {
  const latLon = [];
  const pointKeys = Object.keys(points);

  for (const pointKey of pointKeys) {
    const p = points[pointKey];
    latLon.push([p.lat, p.lng]);
  }

  if (pref.loop) {
    latLon.push([latLon[0][0], latLon[0][1]]);
  }

  if (path) {
    path.remove();
    path = null;
  }
  path = L.polyline(latLon, { interactive: false, color: 'red', weight: 6 })
    .setStyle({ cursor: 'default' })
    .addTo(map);
}

function displayPointHtml(id, lat, lng) {
  const small = smallId(id);
  return `
<div class="point">
    <span class="point-id">id: ${small}</span>
    <div class="point-latlng">
        <label><span>lat:</span><input type="text" value="${lat}"></label>
        <label><span>lng:</span><input type="text" value="${lng}"></label>
    </div>
    <a href="#" data-action="delete" class="delete" role="button">delete</a>
</div>
`;
}

const displayPoint = (id, lat, lng) => {
  // Map Maker
  const marker = L.marker([lat, lng], { draggable: true }).addTo(markerGroup);
  marker.bindPopup(`id: ${smallId(id)}`);
  marker.on('dragend', () => {
    const newLat = marker.getLatLng().lat;
    const newLng = marker.getLatLng().lng;
    const newPosition = { lat: newLat, lng: newLng };
    stopMove();
    // Update reference
    points[id] = newPosition;
    // Update storage
    savePoint(id, newPosition);
    // Update HTML
    const pointContainer = document.getElementById(`point-${id}`);
    pointContainer.innerHTML = displayPointHtml(id, newLat, newLng);
    updatePath();
  });
  // HTML
  const pointContainer = document.createElement('div');
  pointContainer.id = `point-${id}`;
  pointContainer.innerHTML = displayPointHtml(id, lat, lng);
  pointContainer.onclick = (e) => {
    if (e.target.dataset.action === 'delete') {
      stopMove();
      // Update reference
      delete (points[id]);
      // Update storage
      deletePoint(id);
      // Update HTML
      pointContainer.remove();
      marker.remove();
      updatePath();
      return;
    }
    marker.openPopup();
  };
  pointsContainer.appendChild(pointContainer);
};

function loadPref(values) {
  if (values.speed) {
    inputSpeed.value = values.speed;
  }
  if (values.loop) {
    inputLoop.checked = !!values.loop;
  }
}

function savePref() {
  pref.speed = parseFloat(inputSpeed.value.replace(',', '.'));
  pref.loop = !!inputLoop.checked;
  browser.storage.local.set({ pref }).then(() => {}, onError);
  signalBackgroundScript();
}

// Init from storage
browser.storage.local.get().then((results) => {
  const storageKeys = Object.keys(results);
  for (const storageKey of storageKeys) {
    const storageValue = results[storageKey];
    if (storageKey === 'pref') {
      pref = storageValue;
      loadPref(storageValue);
      continue;
    }
    points[storageKey] = storageValue;
    displayPoint(storageKey, storageValue.lat, storageValue.lng);
  }
  updatePath();
  map.fitBounds(markerGroup.getBounds());
}, onError);

// HTML listeners
inputSpeed.addEventListener('change', () => {
  stopMove();
  savePref();
});
inputLoop.addEventListener('change', () => {
  stopMove();
  savePref();
  updatePath();
});
inputLoop.addEventListener('click', () => {
  stopMove();
  savePref();
  updatePath();
});
buttonStart.addEventListener('click', () => {
  if (started !== null) {
    stopMove();
  } else {
    startMove();
  }
});

function onMapClick(e) {
  const id = `${(new Date()).getTime()}`;
  const position = { lat: e.latlng.lat, lng: e.latlng.lng };
  stopMove();
  points[id] = position;
  savePoint(id, position);
  displayPoint(id, e.latlng.lat, e.latlng.lng);
  updatePath();
}

map.on('click', onMapClick);
