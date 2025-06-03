import requests
from bs4 import BeautifulSoup

url = 'https://tabelog.com/kr/rstLst/'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
}

response = requests.get(url, headers=headers)
if response.status_code == 200:
    soup = BeautifulSoup(response.text, 'html.parser')
    restaurants = soup.select('.list-rst__rst-name-target')  # 맛집 이름 셀렉터
    for r in restaurants:
        print(r.text.strip())
else:
    print(f"접속 실패: {response.status_code}")