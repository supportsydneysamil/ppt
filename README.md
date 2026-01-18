# Biblics Extractor Web App

간단한 웹 UI에서 구약/신약, 책, 장/절 범위를 선택해 Biblics에서 텍스트를 가져오고
TXT/PPTX로 내려받는 앱입니다.

## 실행

```bash
npm install
npm start
```

기본 포트는 `3000`이며 외부 접속을 위해 `0.0.0.0`에 바인딩됩니다.

## 사용

1. 구약/신약, 책, 장/절 범위를 선택합니다.
2. 한글 번역(선택안함/새번역/개역한글/현대인의 성경)과 영어 번역(선택안함/NIV)을 선택합니다.
3. `텍스트 가져오기`를 누르면 화면에 출력됩니다.
4. `TXT 다운로드` 또는 `PPTX 다운로드`를 사용할 수 있습니다.

## PPTX 규칙

- 16:9 와이드(`LAYOUT_WIDE`), 좌측 정렬, 여백 유지
- 자동 폰트 맞춤(잘림 방지)
- BOTH 모드: 위 한글, 아래 영어, 영어도 자동 맞춤
- 슬라이드 좌상단에 책/장 약어 라벨 표시
- PPTX 테마: 다크/라이트 + 추천 테마(이미지 배경) + 단색 테마
- 사용자 배경 이미지 적용 시 반투명 오버레이로 가독성 우선

## API

- `GET /api/books`
- `GET /api/verses?testament=ot|nt&book=...&chapter=...&start=...&end=...&lang=ko,en&koVersion=...`
- `GET /api/pptx?testament=ot|nt&book=...&chapter=...&start=...&end=...&lang=ko,en&koVersion=...&themeId=...`
- `POST /api/pptx`
  - JSON 예시:
    ```json
    {
      "testament": "ot",
      "book": "창세기",
      "chapter": "1",
      "start": "1",
      "end": "3",
      "lang": "ko,en",
      "koVersion": "새번역",
      "themeId": "navy",
      "useCustomImage": true,
      "customImageData": "data:image/png;base64,..."
    }
    ```
