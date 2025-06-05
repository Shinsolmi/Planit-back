import requests
from bs4 import BeautifulSoup
import mysql.connector
from dotenv import load_dotenv
import urllib.parse
import os

# 1. .env 로드 및 DB 연결
load_dotenv()

conn = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME")
)
cursor = conn.cursor()

# 2. 키워드 입력
keyword = input("🔍 검색할 키워드를 입력하세요: ").strip()
encoded = urllib.parse.quote(keyword)
url = f"https://tabelog.com/kr/rstLst/?sk={encoded}"
headers = {"User-Agent": "Mozilla/5.0"}

# 3. 웹 요청
res = requests.get(url, headers=headers)
if res.status_code != 200:
    print(f"요청 실패: {res.status_code}")
    exit()

# 4. HTML 파싱
soup = BeautifulSoup(res.text, "html.parser")
results = soup.select("a.list-rst__rst-name-target")

# 5. 결과 저장
for r in results:
    name = r.text.strip()
    link = r['href']
    country = "Japan"       # 고정값 또는 추후 추출 가능
    city = "Tokyo"          # 고정값 또는 추후 추출 가능
    category = "일식"       # 실제 스크래핑할 수 있다면 개선 가능
    description = f"검색어 '{keyword}'로 검색된 맛집"
    image_url = "https://via.placeholder.com/150"  # 실제 이미지가 없으므로 기본값

    print(f"저장 중: {name} - {link}")
    try:
        cursor.execute("""
            INSERT INTO restaurant (country, city, name, category, description, image_url)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (country, city, name, category, description, image_url))
    except mysql.connector.IntegrityError:
        print(f"이미 등록된 식당이거나 삽입 중 오류 발생: {name}")

conn.commit()
cursor.close()
conn.close()
print("저장 완료!")
