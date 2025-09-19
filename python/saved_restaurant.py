import mysql.connector
import uuid

# DB 연결
conn = mysql.connector.connect(
    host="localhost",
    user="root",
    password="admin",
    database="planit"
)
cursor = conn.cursor()

# 실제 존재하는 사용자와 맛집 ID로 설정
user_id = 'u001'  # Users 테이블에 존재해야 함
restaurant_id = 'r001'  # restaurant 테이블에 존재해야 함
saved_id = str(uuid.uuid4())  # 고유 저장 ID

# 저장 실행
try:
    cursor.execute("""
        INSERT INTO saved_restaurant (id, user_id, restaurant_id)
        VALUES (%s, %s, %s)
    """, (saved_id, user_id, restaurant_id))
    conn.commit()
    print("✅ 저장 완료!")
except mysql.connector.IntegrityError:
    print("⚠️ 이미 저장된 맛집입니다.")

# 연결 종료
cursor.close()
conn.close()