# 주일예배 타이틀 절기 카테고리 설계

## 목표

주일예배 타이틀(`type: "title"`) 디자인 카드를 한 줄 나열이 아니라 **카테고리 칩 → 해당 카드만** 고르게 한다. Custom 타이틀과 같은 카탈로그 패턴을 쓰되, 카테고리 목록과 레이아웃은 주일예배 전용이다. 기존 채플·에디토리얼·글로우와 이미 있는 절기·다크 렌더러의 픽셀은 유지한다.

이 문서는 `docs/superpowers/specs/2026-09-14-title-slide-customize-design.md` 위에 얹는다. 제목·날짜 필드 동작은 그 문서를 따른다. 이 문서는 카테고리, 카탈로그, 피커, 신규 디자인만 정의한다.

## 범위

포함:

- 주일예배 타이틀 슬라이드만
- `lib/title-slide-design-catalog.js`와 칩 UI
- 카테고리당 3장 (아래 표)
- 신규 PPTX 렌더와 편집기 미리보기
- 피커에서 뺀 `thanksgiving`의 저장본 렌더 유지

제외:

- Custom 타이틀 카탈로그·UI 변경
- 찬양·성경 `titleThemeId`
- 맥추감사절 카테고리
- 날짜·절기 제안으로 칩이나 `titleDesign`을 자동 변경
- 기존 채플·에디토리얼·글로우와 이미 있는 extra 9종(추수 감사 포함) 좌표·색 변경

선행: 제목 필드와 12종 렌더러(`feature/title-slide-customization`)와 Custom 카탈로그 패턴(`lib/custom-title-design-catalog.js`). 구현은 둘을 이은 워크트리에서 시작한다.

## 접근

주일예배용 카탈로그를 Custom과 **나란히** 둔다. 카테고리 id와 일부 배경 파일은 공유할 수 있고, 레이아웃 함수는 주일예배 모듈만 쓴다. 두 슬라이드 타입을 한 카탈로그로 합치지 않는다.

## 카테고리

칩 순서와 id:

| 순서 | id | 이름 |
|---|---|---|
| 1 | `default` | 기본 |
| 2 | `advent` | 대림절 |
| 3 | `christmas` | 성탄절 |
| 4 | `easter` | 부활절 |
| 5 | `lent` | 사순절 |
| 6 | `palm-sunday` | 종려주일 |
| 7 | `year-end` | 송구영신 |
| 8 | `new-year` | 신년 |
| 9 | `premium` | 기타 (고급) |

Custom과 같은 id를 쓰되 Custom의 `barley-harvest`는 없고, 주일예배에만 `advent`가 있다.

## 카탈로그 항목

각 디자인은 `id`, `name`, `description`, `categoryId`, `layoutFamily`, `theme`, 선택 `asset`을 갖는다. `theme`는 배경·제목·강조·괘선·보조 색과 `mood`(`light` \| `dark`)와 `titleFont`(`serif` \| `sans`)를 담는다. `asset`이 있으면 `{ path, width, height }`이고 경로는 `assets/custom-title/` 또는 `assets/title/` 아래만 허용한다.

피커에 보이는 27장:

| 카테고리 | id | 이름 | 출처 | 패밀리 | 배경/심볼 |
|---|---|---|---|---|---|
| 기본 | `chapel` | 클래식 채플 | 유지 | `legacy` | 없음 |
| 기본 | `editorial` | 모던 에디토리얼 | 유지 | `legacy` | 없음 |
| 기본 | `glow` | 스테인드 글로우 | 유지 | `legacy` | 없음 |
| 대림절 | `advent` | 대림 촛불 | 유지 | `legacy` | 촛불 심볼 (기존) |
| 대림절 | `advent-vesper` | 대림 만찬 | 신규 | `veil-panel` | 없음 |
| 대림절 | `advent-watch` | 대림 기다림 | 신규 | `corner-mark` | 없음 |
| 성탄절 | `christmas-burgundy` | 성탄 버건디 | 유지 | `legacy` | 별 (기존) |
| 성탄절 | `christmas-evergreen` | 성탄 상록 | 유지 | `legacy` | 전나무 (기존) |
| 성탄절 | `christmas-ivory` | 성탄 아이보리 | 신규 | `double-frame` | 없음 |
| 부활절 | `easter-dawn` | 부활 새벽빛 | 유지 | `legacy` | 햇살 (기존) |
| 부활절 | `easter-stained` | 부활 스테인드 | 유지 | `legacy` | 아치 (기존) |
| 부활절 | `easter-linen` | 부활 리넨 | 신규 | `horizon-split` | 없음 |
| 사순절 | `lent-violet` | 사순 자주 | 신규 | `side-band` | 없음 |
| 사순절 | `lent-ashes` | 사순 재 | 신규 | `centered-rule` | 없음 |
| 사순절 | `lent-veil` | 사순 베일 | 신규 | `veil-panel` | named 심볼 또는 `assets/title/` 이미지 1 |
| 종려주일 | `palm-procession` | 종려 행렬 | 신규 | `emblem-crest` | named 종려 심볼 |
| 종려주일 | `palm-court` | 종려 뜰 | 신규 | `double-frame` | 없음 |
| 종려주일 | `palm-horizon` | 종려 지평 | 신규 | `horizon-split` | Custom 종려 자산 재사용 가능 |
| 송구영신 | `year-end-watch` | 송구 파수 | 신규 | `side-band` | 없음 |
| 송구영신 | `year-end-threshold` | 송구 문턱 | 신규 | `corner-mark` | 없음 |
| 송구영신 | `year-end-ember` | 송구 잔불 | 신규 | `veil-panel` | Custom 송구 자산 재사용 가능 |
| 신년 | `new-year-dawn` | 신년 새벽 | 신규 | `horizon-split` | Custom 신년 자산 재사용 가능 |
| 신년 | `new-year-first` | 신년 첫날 | 신규 | `corner-mark` | 없음 |
| 신년 | `new-year-blessing` | 신년 축복 | 신규 | `emblem-crest` | named 심볼 (이미지 없음) |
| 기타 | `midnight-slab` | 미드나잇 슬랩 | 유지 | `legacy` | 없음 (괘선만) |
| 기타 | `slate-split` | 슬레이트 스플릿 | 유지 | `legacy` | 없음 |
| 기타 | `deep-fog` | 딥 포그 | 유지 | `legacy` | 없음 |

같은 카테고리에서 신규 3장의 패밀리는 서로 다르다. 톤은 절제된 고급이다. 이미 심볼이 있는 대림·성탄·부활의 신규 장은 심볼·배경 이미지를 넣지 않는다. 사순·종려·송구·신년은 카테고리당 이미지 또는 심볼을 **1~2장만** 쓴다. 기타(고급)에는 심볼을 넣지 않는다.

`thanksgiving`은 피커 카탈로그 배열에 넣지 않는다. `HIDDEN_TITLE_DESIGNS`로 `normalizeTitleDesign` / 렌더만 알고, `listTitleDesignsByCategory`에는 안 나온다. `findTitleDesign("thanksgiving")`은 렌더용 메타를 돌려주고 `findTitleDesignCategory("thanksgiving")`는 `null`이다.

헬퍼는 Custom과 같은 이름 규칙을 따른다: `normalizeTitleDesignId`, `findTitleDesign`, `findTitleDesignCategory`, `listTitleDesignsByCategory`, `isSafeTitleAssetPath`. 피커 id가 아니고 숨긴 id도 아니면 `chapel`이다.

키가 없을 때 신규 디자인의 원래 영문:

| id 접두 | 영문 |
|---|---|
| `advent-` | `ADVENT SUNDAY` |
| `christmas-ivory` | `CHRISTMAS WORSHIP` |
| `easter-linen` | `EASTER SUNDAY` |
| `lent-` | `LENT` |
| `palm-` | `PALM SUNDAY` |
| `year-end-` | `WATCHNIGHT` |
| `new-year-` | `NEW YEAR` |

한글 원래 문구는 모두 `주일예배`이다.

## UI

`#titleSlideSettings`의 디자인 패널만 바꾼다. 제목·날짜 필드는 그대로다.

가로 칩 탭: 아홉 카테고리를 줄바꿈 칩으로 두고, 아래 `theme-option-grid`에는 **선택된 카테고리의 3장만** 그린다. 칩 라벨은 `이름`과 장 수(`기본 3`)다. 기본 카테고리가 초기 선택이다.

카드는 카탈로그에서 렌더한다. HTML에 27장을 하드코딩하지 않는다.

동작:

- 칩을 바꾸면 그 카테고리 카드를 보여 준다. 현재 `titleDesign`이 그 카테고리에 있으면 그 카드를 켠다. 없으면 그 카테고리 **첫 카드**를 고르고 `titleDesign`을 갱신한다.
- 저장된 슬라이드를 열면 `titleDesign`의 카테고리 칩을 켠다.
- `thanksgiving` 저장본: 칩은 기본, 카드는 선택 없음, 미리보기는 추수 감사. 다른 카드나 다른 칩을 고르면 그 디자인으로 바뀐다. 추수 감사 카드는 만들지 않는다.
- `suggestSeasonLabel`은 부제만 채운다. 칩과 디자인을 바꾸지 않는다.

미리보기 썸네일과 본문 미리보기는 해당 디자인의 구도·색을 따른다. 신규 장은 패밀리별 미리보기 빌더를 쓴다. 알 수 없는 미리보기 클래스는 중립 배경이다.

## 렌더

`appendTitleSlide` 분기:

1. `legacy` (기존 손 렌더러): `chapel` / `editorial` / `glow`는 `title-slide.js`, 나머지 extra 9종(추수 감사 포함)은 `title-slide-extra.js`.
2. 카탈로그에 있고 `layoutFamily !== "legacy"`이면 주일예배 패밀리 디스패치 (`lib/title-slide-catalog-render.js` 등). Custom 패밀리 함수를 호출하지 않는다. 텍스트는 한글·영문·교회명·날짜·부제다.
3. 패밀리 함수가 없거나 카탈로그에 없으면 채플.

패밀리 목록: `centered-rule`, `double-frame`, `side-band`, `horizon-split`, `emblem-crest`, `veil-panel`, `corner-mark`. Custom의 `ornament-frame`은 이번 27장에 쓰지 않는다.

심볼과 구도 괘선은 독립 도형이고 이름은 `title-motif:…` / `title-rule:…`이다. 텍스트와 그룹하지 않는다. 빠진 이미지 파일은 솔리드 또는 그라디언트만 쓰고 슬라이드는 만든다.

빈 영문이면 영문에만 묶인 괘선을 그리지 않는다. `showDate === false`이면 날짜 줄만 생략한다. 기존 3종의 이 규칙은 유지한다.

## 데이터

슬라이드 필드를 추가하지 않는다. `titleDesign`에 새 id가 들어갈 뿐이다. 칩 선택은 저장하지 않는다. 직렬화·템플릿·복제·export는 지금처럼 `titleDesign` 문자열을 보존한다.

## 실패 처리

- 알 수 없는 `titleDesign` → `chapel`
- `thanksgiving` → 기존 extra 렌더
- 없는 패밀리 → 채플
- 없는 자산 파일 → 배경색만, throw 하지 않음
- 잘못된 날짜·빈 제목 → 기존 커스터마이징 스펙과 동일

## 모듈

- `lib/title-slide-design-catalog.js`: 카테고리, 27장, 헬퍼, 자산 경로 검사
- `lib/title-slide-text.js`: `TITLE_DESIGNS`는 피커 27장 + `thanksgiving`. `defaultTitleEn`에 신규 기본 영문
- `lib/title-slide.js`: 카탈로그 신규 id를 패밀리 렌더러로 보냄
- `lib/title-slide-catalog-render.js`: 신규 패밀리 렌더
- `lib/title-slide-extra.js`: 기존 extra만. 신규 장을 여기 더 넣지 않음
- `public/app.js`, `public/index.html`, `public/styles.css`, `public/main.jsx`: 칩, 동적 카드, 미리보기, `window`로 카탈로그 노출

Custom 카탈로그 파일은 읽기만 한다 (자산 경로 재사용). 내용을 바꾸지 않는다.

## 검증

- 카탈로그: 카테고리 9, 각 3장, id 유일, `thanksgiving` 없음, 자산 경로 안전, 카테고리당 이미지/심볼 한도
- `normalizeTitleDesign("thanksgiving") === "thanksgiving"`, 그 외 미지는 `chapel`
- 피커 27장 + `thanksgiving` 각각 PPTX 1장
- 신규 장은 선언한 패밀리와 named 도형. 대림·성탄·부활 신규 3장에 `title-motif:` 없음
- `thanksgiving` PPTX는 지금 extra와 같음
- UI 소스: 칩 필터, 저장본이 해당 칩을 염, 추수 카드 없음, 칩 전환 시 위 선택 규칙
- 기존 3종 기본값 좌표·색 회귀
- Custom 타이틀·찬양·성경 회귀. `npm test`, `npm run build`
