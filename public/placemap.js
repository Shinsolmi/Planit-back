//placemap.js
document.body.style.margin = '0';
document.body.style.padding = '0';

const style = document.createElement('style');
style.innerHTML = `
#control-container {
    display: none; /* ✅ 검색창 숨김 */
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
// mapDiv.style.marginTop = '60px'; /* ❌ 상단 검색바를 제거했으므로 마진도 제거 */
document.body.appendChild(mapDiv);

let currentMap;
let markerCache = {};

// ✅ Flutter 앱으로 장소 이름 전달
function selectPlace(placeName) {
    if (window.flutter_channel) {
        window.flutter_channel.postMessage(placeName);
    } else {
        // 웹에서 테스트할 때만 사용
        alert(`장소 선택 완료: ${placeName}`);
    }
}

async function addMarkerFromPlaceName(placeName, map, description = '') {
    // Cannot access 'currentMap' before initialization 오류 해결을 위해 currentMap 대신 map 사용
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
            // '삭제' 대신 '선택' 버튼 로직 유지
            infoWindowContent.innerHTML = `<strong>${placeName}</strong><br>${description}<br><button id="select-place-${placeName}">선택</button>`;
            const infoWindow = new google.maps.InfoWindow({
                content: infoWindowContent
            });
            marker.addListener('click', () => {
                infoWindow.open(map, marker);
            });
            infoWindow.addListener('domready', () => {
                document.getElementById(`select-place-${placeName}`).addEventListener('click', () => {
                    selectPlace(placeName);
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

    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');
    if (query) {
        placeInput.value = query;
        addMarkerFromPlaceName(query, currentMap, '사용자 검색 장소');
    }

    // 웹뷰 내 검색 기능은 제거되었으나, JS 로직 유지를 위해 이벤트 핸들러는 그대로 둡니다.
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