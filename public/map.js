//map.js
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
.day-button {
    padding: 8px 15px;
    font-size: 14px;
    cursor: pointer;
    border: 1px solid #ccc;
    border-radius: 5px;
    background-color: #f0f0f0;
    white-space: nowrap;
}
.day-button.active {
    background-color: #007BFF;
    color: white;
    border-color: #007BFF;
}
`;
document.head.appendChild(style);

const controlContainer = document.createElement('div');
controlContainer.id = 'control-container';

const dayButtonsContainer = document.createElement('div');
for (let i = 1; i <= 3; i++) {
    const dayButton = document.createElement('button');
    dayButton.textContent = `${i}일차`;
    dayButton.className = 'day-button';
    dayButton.dataset.day = i;
    dayButtonsContainer.appendChild(dayButton);
}
controlContainer.appendChild(dayButtonsContainer);

document.body.appendChild(controlContainer);

const mapDiv = document.createElement('div');
mapDiv.id = 'map';
mapDiv.style.width = '100%';
mapDiv.style.height = '100vh';
mapDiv.style.marginTop = '60px';
document.body.appendChild(mapDiv);

let currentMap;
let markerCache = {};
let directionsService;
let directionsRenderers = [];
let allSchedules = {};
let currentDay = 1;
let currentPlaceIndex = 0;

const dayColors = [
    'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
    'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
    'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
];

async function fetchSchedules() {
    try {
        const res = await fetch('/schedules.json');
        const data = await res.json();
        allSchedules = data.reduce((acc, dayPlan) => {
            acc[dayPlan.day] = dayPlan.plan;
            return acc;
        }, {});
    } catch (err) {
        console.error('스케줄 불러오기 실패:', err);
    }
}

function clearMap() {
    for (const key in markerCache) {
        markerCache[key].setMap(null);
    }
    markerCache = {};
    directionsRenderers.forEach(renderer => renderer.setMap(null));
    directionsRenderers = [];
}

function renderDaySchedule(day) {
    clearMap();
    currentDay = day;
    currentPlaceIndex = 0;
    if (!allSchedules[day]) {
        alert(`${day}일차 스케줄이 없습니다.`);
        return;
    }
    const daySchedules = allSchedules[day];
    const markerColor = dayColors[day - 1] || dayColors[0];

    if (daySchedules.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        daySchedules.forEach((schedule, index) => {
            const placeTitle = schedule.place;
            const position = { lat: schedule.lat, lng: schedule.lng };
            const marker = new google.maps.Marker({
                position: position,
                map: currentMap,
                title: placeTitle,
                icon: {
                    url: markerColor,
                    scaledSize: new google.maps.Size(32, 32)
                },
                label: {
                    text: (index + 1).toString(),
                    color: "white",
                    fontWeight: "bold"
                }
            });
            const infoWindow = new google.maps.InfoWindow({
                content: `<strong>${schedule.place}</strong><br>메모: ${schedule.memo || '없음'}`
            });
            marker.addListener('click', () => {
                infoWindow.open(currentMap, marker);
            });
            markerCache[placeTitle] = marker;
            bounds.extend(position);
        });
        currentMap.fitBounds(bounds);

        if (daySchedules.length > 1) {
            renderAllRoutes();
        } else if (daySchedules.length === 1) {
            alert(`${day}일차는 경로를 표시하려면 2개 이상의 장소가 필요합니다.`);
        }
    }
}

function renderAllRoutes() {
    directionsRenderers.forEach(renderer => renderer.setMap(null));
    directionsRenderers = [];

    const daySchedules = allSchedules[currentDay];
    if (!daySchedules || daySchedules.length < 2) {
        return;
    }

    for (let i = 0; i < daySchedules.length - 1; i++) {
        const startPlace = daySchedules[i];
        const endPlace = daySchedules[i + 1];

        const request = {
            origin: { lat: startPlace.lat, lng: startPlace.lng },
            destination: { lat: endPlace.lat, lng: endPlace.lng },
            travelMode: google.maps.TravelMode.WALKING
        };

        const routeColor = currentDay === 1 ? '#FF0000' : (currentDay === 2 ? '#0000FF' : '#008000');
        const renderer = new google.maps.DirectionsRenderer({
            map: currentMap,
            suppressMarkers: true,
            polylineOptions: {
                strokeColor: routeColor,
                strokeOpacity: 0.8,
                strokeWeight: 5
            }
        });

        directionsService.route(request, (result, status) => {
            if (status === google.maps.DirectionsStatus.OK) {
                renderer.setDirections(result);
                directionsRenderers.push(renderer);
            } else {
                console.error(`경로를 불러오는 데 실패했습니다: ${startPlace.place} -> ${endPlace.place} (${status})`);
            }
        });
    }
}

function loadGoogleMaps(apiKey) {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=places`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

async function initMap() {
    const center = { lat: 37.5665, lng: 126.9780 };
    const map = new google.maps.Map(document.getElementById("map"), {
        zoom: 12,
        center: center
    });
    currentMap = map;
    directionsService = new google.maps.DirectionsService();

    await fetchSchedules();

    const dayButtons = document.querySelectorAll('.day-button');
    dayButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            dayButtons.forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            const day = parseInt(event.target.dataset.day, 10);
            renderDaySchedule(day);
        });
    });

    const firstDayButton = document.querySelector('.day-button[data-day="1"]');
    if (firstDayButton) {
        firstDayButton.click();
    }
}