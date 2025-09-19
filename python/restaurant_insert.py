# restaurant_insert.py
import uuid
import mysql.connector
from bs4 import BeautifulSoup
import requests
from dotenv import load_dotenv
import os

load_dotenv()

conn = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME")
)

cursor = conn.cursor()

# 웹스크래핑 대상 페이지
url = 'https://tabelog.com/kr/rstLst/'
headers = {'User-Agent': 'Mozilla/5.0'}
res = requests.get(url, headers=headers)
soup = BeautifulSoup(res.text, 'html.parser')

# 맛집 이름 가져오기
restaurant_names = soup.find_all('a', class_='list-rst__rst-name-target')

for r in restaurant_names:
    name = r.text.strip()
    country = 'Japan'
    city = 'Tokyo'
    category = '일식'  # 임시값
    description = '웹에서 스크래핑된 맛집입니다.'  # 임시값
    image_url = 'https://via.placeholder.com/150'  # 임시 이미지 링크

    print(f"📌 저장: {name}")
    cursor.execute("""
        INSERT INTO restaurant (country, city, name, category, description, image_url)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (country, city, name, category, description, image_url))

conn.commit()
cursor.close()
conn.close()