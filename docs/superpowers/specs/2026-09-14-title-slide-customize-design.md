# 주일예배 타이틀 커스터마이징 설계

## 목표

`타이틀` 슬라이드(`type: "title"`)에서 한글·영문 제목과 날짜를 편집할 수 있게 한다. 기존 세 디자인은 기본값으로 뽑으면 지금과 같은 화면이 나오게 좌표·색·글꼴·간격을 유지한다. 절기 6종과 어두운 3종을 디자인 카드에 더한다.

## 범위

포함:

- 주일예배 타이틀 슬라이드 타입 (`title`)만
- 편집기 미리보기, 개별 PPTX, 통합 PPTX, 슬라이드 저장, 템플릿 저장·복제
- 기존 3종에 제목 필드·날짜 모드·날짜 표시를 연결하되, 기본값 출력은 현재와 같게 유지
- 절기 6종(심볼 있음)과 어두운 3종(심볼 없음)

제외:

- Custom 타이틀 (`custom-title`)
- 찬양·성경 표지 테마 (`titleThemeId`)
- 성경 본문 테마, 사용자 배경 이미지, 성경 웹 뷰

## 디자인 ID

허용 값과 카드 순서:

| ID | 카드 이름 | 그룹 |
|---|---|---|
| `chapel` | 클래식 채플 | 기존 |
| `editorial` | 모던 에디토리얼 | 기존 |
| `glow` | 스테인드 글로우 | 기존 |
| `easter-dawn` | 부활 새벽빛 | 절기 |
| `easter-stained` | 부활 스테인드 | 절기 |
| `christmas-burgundy` | 성탄 버건디 | 절기 |
| `christmas-evergreen` | 성탄 상록 | 절기 |
| `thanksgiving` | 추수 감사 | 절기 |
| `advent` | 대림 촛불 | 절기 |
| `midnight-slab` | 미드나잇 슬랩 | 어두운 |
| `slate-split` | 슬레이트 스플릿 | 어두운 |
| `deep-fog` | 딥 포그 | 어두운 |

`normalizeTitleDesign(value)`는 허용 값이 아니면 `chapel`을 반환한다. 기본 선택은 `chapel`이다.

기존 3종의 배경·프레임·타이포·괘선 숫자는 현재 `lib/title-slide.js`와 미리보기를 기준으로 한다. 새 필드를 읽도록 코드를 고치되, 기본값 조합의 시각 결과는 지금과 같아야 한다.

## 데이터 모델

| 필드 | 새 슬라이드 기본값 | 역할 |
|---|---|---|
| `titleKo` | `"주일예배"` | 큰 한글 제목 |
| `titleEn` | `"SUNDAY WORSHIP"` | 영문 제목 |
| `titleDesign` | `"chapel"` | 위 12종 중 하나 |
| `dateMode` | `"custom"` | `next-sunday` / `today` / `custom` |
| `showDate` | `true` | 날짜 줄 표시 여부 |
| `serviceDate` | 브라우저 로컬 오늘 `YYYY-MM-DD` | 예배 날짜 |
| `churchName` | 지금과 같음 | 교회 이름 |
| `titleSubtitle` | 지금과 같음 | 선택 부제 |

제목 해석:

- 키가 없거나 `null`이면 **테마 원래 문구**를 쓴다. 레거시 저장본이 지금과 같게 나온다.
  - 한글 원래 문구: 모든 기존 테마 `"주일예배"`
  - 영문 원래 문구: 채플·글로우 `"SUNDAY WORSHIP"`, 에디토리얼 `"SUNDAY WORSHIP SERVICE"`, 새 테마는 아래 표
- 앞뒤 공백을 제거한 값이 `""`이면 그 줄만 숨긴다. 사용자가 필드를 지운 경우다.
- 그 외 문자열은 그대로 그린다.

새 테마의 원래 영문(키가 없을 때만):

| ID | 영문 |
|---|---|
| `easter-dawn`, `easter-stained` | `EASTER SUNDAY` |
| `christmas-burgundy`, `christmas-evergreen` | `CHRISTMAS WORSHIP` |
| `thanksgiving` | `THANKSGIVING` |
| `advent` | `ADVENT SUNDAY` |
| `midnight-slab`, `slate-split`, `deep-fog` | `SUNDAY WORSHIP` |

새 슬라이드는 폼과 저장본에 `titleKo`/`titleEn`을 명시적으로 넣는다. 디자인을 바꿔도 사용자가 고친 제목은 유지한다. 테마 원래 영문은 레거시 호환과 키가 비어 있을 때만 쓴다.

`dateMode`가 없거나 허용 값이 아니면 `custom`이다. `showDate`가 없으면 `true`이다. 기존 `serviceDate`는 그대로 둔다. 새 슬라이드만 브라우저 오늘로 채운다.

날짜 모드:

- `custom`: 저장된 `serviceDate`를 쓴다. 비어 있으면 오늘로 채운다.
- `today`: 열 때마다 오늘로 맞춘다. 저장 시점의 오늘을 `serviceDate`에 기록한다.
- `next-sunday`: 오늘이 주일이면 오늘, 아니면 다가오는 주일. `upcomingSundays`와 같다. 저장 시점의 그 값을 `serviceDate`에 기록한다.

날짜 계산은 기존처럼 UTC 달력 날짜(`YYYY-MM-DD`)를 쓴다. 브라우저 오늘은 `TitleSlideDate.todayIsoDate()`다.

`showDate`가 `false`이면 날짜 텍스트(에디토리얼의 `DATE` 라벨 포함)만 그리지 않는다. `dateMode`와 `serviceDate`는 유지한다.

절기 부제 제안(`suggestSeasonLabel`)은 선택된 날짜 기준이다. 디자인을 자동으로 바꾸지 않는다.

이 필드들은 `titleDesign`·Custom 타이틀·찬양 `titleThemeId`와 섞지 않는다.

## UI

`titleSlideSettings` 패널만 바꾼다.

디자인 그리드는 위 표 순서의 12장이다. 기존 3장 썸네일 클래스는 그대로 두고, 새 9장은 각 구도가 보이게 썸네일을 추가한다.

예배 정보 행 순서:

1. 교회 이름
2. 한글 타이틀
3. 영문 타이틀
4. 부제 (지금처럼 절기 제안 버튼)
5. 날짜 표시 (켜기/끄기)
6. 날짜 모드: 다음 주일 / 오늘 / 수동
7. 날짜 값

한글·영문 입력의 placeholder는 기본값이다. 비우면 미리보기에서 해당 줄이 사라진다.

날짜 표시를 끄면 날짜 줄만 미리보기에서 빠진다. 모드와 날짜 입력은 남겨 다시 켤 수 있게 한다.

수동이면 날짜 입력(`type="date"` 또는 동등한 선택기)으로 고친다. 다음 주일·오늘이면 계산된 날짜를 보여 주고 입력은 읽기 전용이 아니다. 그 상태에서 날짜를 바꾸면 모드를 `custom`으로 바꾼다.

모드를 다음 주일 또는 오늘로 바꾸면 `serviceDate`를 즉시 다시 계산하고 미리보기를 갱신한다.

저장 검증은 지금처럼 교회 이름과 날짜가 필요하다. `showDate`가 꺼져 있어도 `serviceDate`는 있어야 한다.

## 렌더

공통 내용 객체:

- `church`, `subtitle`: 지금과 같음
- `ko`: 해석된 한글 제목. 숨기면 `""`
- `en`: 해석된 영문 제목. 숨기면 `""`
- `koDate`, `enDate`: `showDate`가 거짓이거나 날짜가 잘못되면 `""`

기존 3종은 하드코딩 `"주일예배"` / `"SUNDAY WORSHIP"` 자리에 `ko` / `en`을 넣는다. 빈 문자열이면 그 텍스트 박스와, 영문이 없을 때만 의미가 있는 구분선은 그리지 않는다. 나머지 좌표는 유지한다. 스택형(채플)은 빈 항목을 빼서 가운데를 다시 잡는다. 에디토리얼·글로우의 고정 좌표 요소는 제목이 비어도 다른 요소 자리를 옮기지 않는다. 단 글로우 네 글자 블록은 아래 예외를 따른다.

글로우: `ko === "주일예배"`이면 지금처럼 네 글자 엇갈림이다. 그 외 비어 있지 않은 `ko`는 같은 영역에서 한 줄 중앙이다. `ko`가 비면 글자 블록만 생략한다.

제목이 테마 기본 박스보다 길면 그 테마의 최대 크기에서 한 단계씩 줄인다. 기존 3종의 기본 문구(`주일예배`, `SUNDAY WORSHIP`, `SUNDAY WORSHIP SERVICE`)는 지금 크기를 유지한다.

새 9종 구도:

- 부활 새벽빛: 제목 상단 정렬, 위에서 내려오는 햇살, 아래 지평선과 날짜
- 부활 스테인드: 아치 창이 제목을 감쌈, 교회 이름은 하단
- 성탄 버건디: 좌측 세로 정렬, 좌측 금색 띠, 우측 큰 별
- 성탄 상록: 제목 상단, 하단 전나무 실루엣, 상단 작은 별
- 추수 감사: 중앙 제목을 좌우 이삭이 감쌈
- 대림 촛불: 위 촛불에서 아래 제목으로 내려오는 세로 축, 하단 점 네 개
- 미드나잇 슬랩: 우측 정렬 제목, 좌측 세로 괘선, 심볼 없음
- 슬레이트 스플릿: 좌우 분할, 왼쪽 정보·오른쪽 제목, 심볼 없음
- 딥 포그: 상단 옅은 안개, 하단 정렬 제목, 심볼 없음

절기 심볼(햇살, 아치, 별, 전나무, 이삭, 촛불, 대림 점)은 배경 PNG에 구워 넣지 않는다. PptxGenJS 도형으로 각각 올리고 `p:cNvPr` 이름을 `title-motif:…` 형식으로 붙인다. PowerPoint에서 심볼만 선택해 지울 수 있어야 한다. 제목·날짜·교회 이름 텍스트와 그룹으로 묶지 않는다.

어두운 3종에는 `title-motif:` 도형이 없다. 세로 괘선·분할선은 구도용 도형이며 이름 접두사는 `title-rule:`이다. 이것도 독립 도형이라 지울 수 있다.

배경 그라디언트가 필요하면 기존 타이틀과 같이 PNG 레이어로 넣는다. 심볼은 그 위에 도형으로 올린다.

미리보기는 PPTX와 같은 구도·색·모티프 배치를 따른다.

## 모듈

- `lib/title-slide.js`: `TITLE_DESIGNS`를 12종으로 넓히고 `appendTitleSlide`가 분기한다. 기존 3종 함수는 같은 파일에서 `ko`/`en`/`showDate`를 읽도록만 고친다.
- 새 모듈(예: `lib/title-slide-extra.js`): 절기 6종과 어두운 3종 렌더, 모티프 도형 이름.
- `lib/title-slide-date.js`: `normalizeDateMode`, 필요하면 `resolveServiceDate(mode, storedIso, todayIso)`.
- `lib/slide-record.js`: 새 필드를 템플릿·저장 스키마에 넣는다. `titleKo`/`titleEn`은 문자열이 아니면 `null`(미설정 → 테마 원래 문구)이다. 빈 문자열은 숨김이다. `slide.titleKo || ""`처럼 합치지 않는다. 그렇게 하면 레거시 저장본의 제목이 숨겨진다. `dateMode`가 없으면 `custom`, `showDate`가 `false`가 아니면 `true`다. 새 슬라이드 기본 문자열은 클라이언트가 채운다.
- `public/app.js` / `public/index.html` / `public/styles.css`: 폼, 카드, 미리보기.
- `server.js`의 타이틀 PPTX 생성은 `appendTitleSlide`에 본문을 그대로 넘긴다.

## 실패 처리

- 알 수 없는 `titleDesign` → `chapel`
- 알 수 없는 `dateMode` → `custom`
- 잘못된 `serviceDate` → 날짜 텍스트만 빈 문자열, 슬라이드는 생성
- API에 날짜가 없으면 서버 오늘(`todayIsoDate`)
- 요청을 제목 때문에 거절하지 않는다. 교회 이름 없음은 지금처럼 클라이언트 저장 검증이다.

## 검증

- 기존 3종, 레거시 레코드(제목 키 없음, `dateMode` 없음): PPTX 텍스트·좌표·색이 현재와 같다. 글로우 네 글자 엇갈림 유지.
- 새 슬라이드 기본값(`주일예배` / `SUNDAY WORSHIP` / 수동 / 오늘 / 날짜 표시): 채플·글로우는 현재와 같고, 에디토리얼 영문만 `SUNDAY WORSHIP`이 된다. 에디토리얼 레거시는 `SUNDAY WORSHIP SERVICE`.
- `titleKo`/`titleEn`을 바꾸면 미리보기와 PPTX에 반영. 빈 문자열이면 해당 줄 생략.
- 글로우에서 `주일예배`가 아니면 한 줄 중앙.
- `dateMode` 기본 `custom`, 초기 날짜는 브라우저 오늘. `today`·`next-sunday` 전환. `showDate: false`면 날짜 없음.
- 날짜를 고치면 모드가 `custom`.
- 슬라이드·템플릿 직렬화에 새 필드 보존.
- 12종 모두 미리보기와 PPTX가 한 장씩 생긴다.
- 절기 6종 PPTX에 `title-motif:` 도형이 있고 텍스트와 그룹되지 않는다.
- 어두운 3종에 `title-motif:`가 없다.
- 기존 찬양·Custom 타이틀·성경 동작 회귀. 전체 테스트와 `npm run build`.
