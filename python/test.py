import requests
from bs4 import BeautifulSoup

# 요청할 URL
url = "https://news.naver.com/newspaper/home?viewType=pc"
#GET 요청 -> 읽어드리는거임
response = requests.get(url)

html = """
<nav class="menu-box-1" id="menu-box">
 <ul>
   <li>
      <a class="menu-item-text" href-"https://www.naver.com">네이버로 이동</a>
     </li>
    <li>
      <a class="menu-item-text" href-"https://www.google.com">구글로 이동</a>
     </li>
     <li>
     <a class="daum" href-"https://www.daum.com">다음으로 이동</a>
     </li>
    </ul>
</nav>
"""

# HTML 파싱싱
bs = BeautifulSoup(html, 'html.parser')

#find, find_all
#print(bs.select_one('.menu-item-text')) -> 클래스가 'menu-item-text'인 녀석을 선택
#print(bs.select_one('#menu-item-text')) -> id가 'menu-item-text'인 녀석을 선택
print(bs.find('a', class_='menu-item-text'))
print(bs.find_all('a', class_='menu-item-text'))
#select, select_one : 태그, 클레스, id로 HTML을 검색
#bs.select('a') : HTML 상에 있는 모든 'a' 앨리먼트를 검색
'''
print(bs.select('a'))
print(bs.select_one('a'))
'''
a_tags = bs.select('a')

for a_tag in a_tags:
    print(a_tag.get_text())

'''
print(response.status_code)  # 200이면 성공

print(response.text)         # HTML 내용 출력
'''