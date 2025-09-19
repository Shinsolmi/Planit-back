import requests
from bs4 import BeautifulSoup
import mysql.connector
from dotenv import load_dotenv
import urllib.parse
import os
import time

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# DB 연결
conn = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME")
)
cursor = conn.cursor()

def geocode_with_google(address):
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address": address,
        "language": "ko",
        "key": GOOGLE_API_KEY
    }
    res = requests.get(url, params=params).json()
    if not res['results']:
        return None
    result = res['results'][0]
    country = city = None
    for comp in result['address_components']:
        if 'country' in comp['types']:
            country = comp['long_name']
        if 'locality' in comp['types'] or 'administrative_area_level_1' in comp['types']:
            city = comp['long_name']
    return {
        "formatted_address": result['formatted_address'],
        "lat": result['geometry']['location']['lat'],
        "lng": result['geometry']['location']['lng'],
        "country": country,
        "city": city
    }

# 키워드 입력
keyword = input("🔍 검색할 키워드를 입력하세요: ").strip()
encoded = urllib.parse.quote(keyword)
url = f"https://tabelog.com/kr/rstLst/?sk={encoded}"
headers = {"User-Agent": "Mozilla/5.0"}

res = requests.get(url, headers=headers)
soup = BeautifulSoup(res.text, "html.parser")
results = soup.select("a.list-rst__rst-name-target")

markers = []  # 지도에 사용할 마커 저장

for r in results:
    name = r.text.strip()
    link = r['href']
    time.sleep(1)
    detail_res = requests.get(link, headers=headers)
    detail_soup = BeautifulSoup(detail_res.text, "html.parser")

    # 기본 정보
    address_tag = detail_soup.select_one('.rstinfo-table__address')
    address = address_tag.text.strip() if address_tag else ''
    image_tag = detail_soup.select_one('.p-photo__img')
    image_url = image_tag['src'] if image_tag else 'https://via.placeholder.com/150'
    category_tag = detail_soup.select_one('.linktree__parent-target')
    category = category_tag.text.strip() if category_tag else '기타'

    geo = geocode_with_google(address)
    if not geo:
        print(f"❌ 지오코딩 실패: {name}")
        continue

    print(f"📌 저장: {name} ({geo['formatted_address']})")

    try:
        cursor.execute("""
            INSERT INTO restaurant (country, city, name, category, description, image_url, lat, lng)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            geo["country"], geo["city"], name, category,
            geo["formatted_address"], image_url, geo["lat"], geo["lng"]
        ))

        # 지도용 마커
        markers.append({
            "name": name,
            "lat": geo["lat"],
            "lng": geo["lng"],
            "category": category
        })

    except mysql.connector.Error as e:
        print(f"⚠️ DB 오류: {e}")

conn.commit()
cursor.close()
conn.close()
print("✅ 모든 식당 저장 완료!")

# 지도 HTML 생성
with open("map.html", "w", encoding="utf-8") as f:
    f.write(f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>맛집 지도</title>
  <style>#map {{ height: 90vh; width: 100%; }}</style>
</head>
<body>
  <h2>📍 저장된 맛집 위치</h2>
  <div id="map"></div>
  <script>
    function initMap() {{
      const map = new google.maps.Map(document.getElementById('map'), {{
        zoom: 13,
        center: {{ lat: {markers[0]['lat']}, lng: {markers[0]['lng']} }}
      }});
""")
    for m in markers:
        f.write(f"""
      new google.maps.Marker({{
        position: {{ lat: {m['lat']}, lng: {m['lng']} }},
        map: map,
        title: "{m['name']} - {m['category']}"
      }});
""")
    f.write(f"""
    }}
  </script>
  <script src="https://maps.googleapis.com/maps/api/js?key={GOOGLE_API_KEY}&callback=initMap" async defer></script>
</body>
</html>
""")

print("🗺️ 지도 파일(map.html) 생성 완료. 브라우저에서 열어보세요.")
