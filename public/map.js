// public/map.js

document.body.style.margin = '0';
document.body.style.padding = '0';

const mapDiv = document.createElement('div');
mapDiv.id = 'map';
mapDiv.style.width = '100%';
mapDiv.style.height = '100vh';
document.body.appendChild(mapDiv);

// 스케줄 정보를 받아 지도에 마커 표시
async function fetchAndRenderMarkers(map) {
    try {
        const res = await fetch('/schedules/map');
        const data = await res.json();

        data.forEach(schedule => {
            const marker = new google.maps.Marker({
                position: { lat: schedule.lat, lng: schedule.lng },
                map,
                title: schedule.title
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `<strong>${schedule.title}</strong><br>${schedule.description || ''}`
            });

            marker.addListener('click', () => {
                infoWindow.open(map, marker);
            });
        });
    } catch (err) {
        console.error('스케줄 불러오기 실패:', err);
    }
}

function loadGoogleMaps(apiKey) {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`;
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

    fetchAndRenderMarkers(map);
}
