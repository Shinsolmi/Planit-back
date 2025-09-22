//placemap.js
document.body.style.margin = '0';
document.body.style.padding = '0';

const style = document.createElement('style');
style.innerHTML = `
#control-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    padding: 10px;
    background-color: white;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    z-index: 10;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
#search-container {
    display: flex;
    gap: 10px;
}
`;
document.head.appendChild(style);

const controlContainer = document.createElement('div');
controlContainer.id = 'control-container';

const searchContainer = document.createElement('div');
searchContainer.id = 'search-container';
const placeInput = document.createElement('input');
placeInput.id = 'place-input';
placeInput.type = 'text';
placeInput.placeholder = '장소 이름을 입력하세요';
const searchButton = document.createElement('button');
searchButton.id = 'search-button';
searchButton.textContent = '검색';

searchContainer.appendChild(placeInput);
searchContainer.appendChild(searchButton);
controlContainer.appendChild(searchContainer);

document.body.appendChild(controlContainer);

const mapDiv = document.createElement('div');
mapDiv.id = 'map';
mapDiv.style.width = '100%';
mapDiv.style.height = '100vh';
mapDiv.style.marginTop = '60px';
document.body.appendChild(mapDiv);

let currentMap;
let markerCache = {};

// 이 함수를 Flutter 앱에서 직접 호출합니다.
async function addMarkerFromPlaceName(placeName, map, description = '') {
    if (markerCache[placeName]) {
        map.setCenter(markerCache[placeName].getPosition());
        return { lat: markerCache[placeName].getPosition().lat(), lng: markerCache[placeName].getPosition().lng(), placeName: placeName };
    }
    const geocoder = new google.maps.Geocoder();
    try {
        const result = await geocoder.geocode({ address: placeName });
        if (result.results && result.results.length > 0) {
            const location = result.results[0].geometry.location;
            const marker = new google.maps.Marker({
                position: location,
                map: map,
                title: placeName
            });
            const infoWindowContent = document.createElement('div');
            infoWindowContent.innerHTML = `<strong>${placeName}</strong><br>${description}<br><button id="delete-marker-${placeName}">삭제</button>`;
            const infoWindow = new google.maps.InfoWindow({
                content: infoWindowContent
            });
            marker.addListener('click', () => {
                infoWindow.open(map, marker);
            });
            infoWindow.addListener('domready', () => {
                document.getElementById(`delete-marker-${placeName}`).addEventListener('click', () => {
                    marker.setMap(null);
                    delete markerCache[placeName];
                    infoWindow.close();
                    alert(`'${placeName}' 장소가 삭제되었습니다.`);
                });
            });
            map.setCenter(location);
            map.setZoom(15);
            markerCache[placeName] = marker;
            return { lat: location.lat(), lng: location.lng(), placeName: placeName };
        } else {
            alert(`'${placeName}'에 대한 위치 정보를 찾을 수 없습니다.`);
            return null;
        }
    } catch (error) {
        console.error('지오코딩 오류:', error);
        return null;
    }
}

function loadGoogleMaps(apiKey) {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=places`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

function initMap() {
    const center = { lat: 37.5665, lng: 126.9780 };
    const map = new google.maps.Map(document.getElementById("map"), {
        zoom: 12,
        center: center
    });
    currentMap = map;

    searchButton.addEventListener('click', () => {
        const placeName = placeInput.value.trim();
        if (placeName) {
            addMarkerFromPlaceName(placeName, currentMap, '사용자 검색 장소');
        } else {
            alert('장소 이름을 입력해주세요.');
        }
    });

    placeInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            searchButton.click();
        }
    });
}