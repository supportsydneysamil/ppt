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
2. 언어(한글 RNKSV / 영어 NIV / 둘 다)를 선택합니다.
3. `텍스트 가져오기`를 누르면 화면에 출력됩니다.
4. `TXT 다운로드` 또는 `PPTX 다운로드`를 사용할 수 있습니다.

## PPTX 규칙

- 16:9 와이드(`LAYOUT_WIDE`), 배경 검정/폰트 흰색, 좌측 정렬
- 여백을 유지하며 자동 폰트 맞춤(잘림 방지)
- BOTH 모드: 위 한글, 아래 영어, 영어 폰트 사이즈는 전체 슬라이드 동일

## API

- `GET /api/books`
- `GET /api/verses?testament=ot|nt&book=...&chapter=...&start=...&end=...&lang=ko,en`
- `GET /api/pptx?testament=ot|nt&book=...&chapter=...&start=...&end=...&lang=ko,en`
