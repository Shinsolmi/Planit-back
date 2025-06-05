import requests
from bs4 import BeautifulSoup
import urllib.parse

def search_tabelog(keyword):
    # 키워드를 URL 인코딩
    encoded = urllib.parse.quote(keyword)
    url = f'https://tabelog.com/kr/rstLst/?sk={encoded}'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }

    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        print(f"접속 실패: {response.status_code}")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    results = soup.select('a.list-rst__rst-name-target')

    if not results:
        print("결과가 없습니다.")
        return

    print(f"'{keyword}' 키워드로 검색된 맛집 목록:")
    for r in results:
        name = r.text.strip()
        link = r['href']
        print(f"🍽️ {name} - {link}")

# 예시 실행
if __name__ == '__main__':
    keyword = input("검색할 키워드를 입력하세요: ")
    search_tabelog(keyword)
