import mysql.connector
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

# 사용자 ID 설정 (예: u001)
user_id = 'u001'

# 저장된 맛집 조회 쿼리
cursor.execute("""
    SELECT r.name, r.city, r.country, r.category, r.description
    FROM saved_restaurant sr
    JOIN restaurant r ON sr.restaurant_id = r.id
    WHERE sr.user_id = %s
""", (user_id,))

results = cursor.fetchall()

# 출력
print("🍽️ 저장한 맛집 목록:")
for row in results:
    print(f"- {row[0]} ({row[1]}, {row[2]}) | {row[3]}: {row[4]}")

cursor.close()
conn.close()