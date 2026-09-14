# 템플릿 스키마 Import / Export 설계

## 목표

PPTX 결과물이 아니라 템플릿 정의(슬라이드 타입, 텍스트, 테마, 찬송가 번호 등)만 JSON으로 주고받는다. 다른 컴퓨터에서 같은 프로그램을 실행하면 그 스키마로 동일한 PPT를 다시 생성할 수 있다.

## 범위

포함:

- 템플릿 갤러리에서 템플릿 **한 장**을 스키마 JSON으로 내보내기
- 같은 JSON을 가져와 **항상 새 템플릿**으로 추가하기
- 로컬 업로드 경로를 스키마에서 제거하고, 그 때문에 복원되지 않는 슬라이드를 사용자에게 알리기

제외:

- 전체 템플릿 일괄 백업
- 같은 이름/id로 덮어쓰기
- 올린 PPTX·이미지 바이트를 JSON이나 zip에 넣는 것
- Import 직후 찬송가 파일을 미리 받아 두는 것 (미리보기·PPT 생성 때 기존처럼 다시 받는다)
- 메인 슬라이드 목록(`data/slides.json`) Import/Export

## 파일 형식

파일 이름: `{템플릿이름}.samil-template.json`

```json
{
  "kind": "samil-template-schema",
  "version": 1,
  "exportedAt": "2026-09-14T06:54:00.000Z",
  "template": {
    "name": "주일 예배",
    "slides": []
  }
}
```

- `kind`는 반드시 `samil-template-schema`
- `version`은 필수 양의 정수다. 호환 규칙은 아래 「스키마 버전」을 따른다
- `template.id`, `createdAt`, `slideCount`는 넣지 않는다. Import 때 서버가 새로 만든다
- 슬라이드 `id`도 스키마에 넣지 않는다. `POST /api/templates`가 지금처럼 복제하면서 새 id를 부여한다

잘못된 파일이면 저장하지 않는다. 부분 Import는 없다.

## 스키마 버전

파일의 `version`이 호환성 계약이다. 슬라이드 필드가 나중에 바뀌어도, 앱은 이 숫자만 보고 읽을 수 있는지 판단한다.

상수 (한 모듈에서 export):

| 이름 | 지금 값 | 역할 |
|---|---|---|
| `TEMPLATE_SCHEMA_KIND` | `"samil-template-schema"` | 파일 종류 |
| `TEMPLATE_SCHEMA_VERSION` | `1` | Export가 쓰는 현재 버전 |
| `TEMPLATE_SCHEMA_MIN_VERSION` | `1` | 이 앱이 아직 읽는 가장 오래된 버전 |
| `TEMPLATE_SCHEMA_MAX_VERSION` | `1` | 이 앱이 아는 가장 새 버전 |

규칙:

1. **Export**는 항상 `version: TEMPLATE_SCHEMA_VERSION`을 쓴다.
2. **Import**는 `version`이 없거나 정수가 아니면 거절한다.
3. `version < MIN`이면 거절한다. 너무 옛 형식이라 이 앱이 더 이상 읽지 않는다.
4. `version > MAX`이면 거절한다. 더 새 앱이 만든 파일이므로, “앱을 업데이트한 뒤 다시 가져와 주세요”라고 알린다. 슬라이드를 추측해서 넣지 않는다.
5. `MIN ≤ version ≤ MAX`이면 `migrateTemplateSchema(doc)`가 `version`부터 현재까지 한 단계씩 올린 뒤 슬라이드를 검증한다. 지금 지원 버전이 1뿐이라 마이그레이션은 그대로 통과하는 identity다.

필드가 늘어나기만 하고 옛 파일이 그대로 의미가 있으면 **버전을 올리지 않는다.** `sanitizeSlideForTemplate`이 없는 키는 기본값으로 채우고, envelope의 모르는 키는 무시한다. 그래서 같은 `version: 1` 파일을 새 앱이 읽어도 된다.

이름 변경, 의미 변경, 필수 필드 추가처럼 옛 파일을 그대로 두면 잘못 해석되면 **버전을 1 올리고** `migrateTemplateSchema`에 `N → N+1` 분기를 추가한다. MIN/MAX도 그때 같이 조정한다. 이번 구현에는 분기 본문을 넣지 않는다. 버전 숫자와 identity 마이그레이션만 둔다.

## 이식 가능한 슬라이드 필드

기존 `sanitizeSlideForTemplate` 형태를 기준으로, 이 컴퓨터에만 있는 값을 비운다.

가져가는 것:

- 타입, 이름, `sourceType`, 본문, 폰트, 크기, 배경, 정렬
- 주일예배 타이틀·Custom 타이틀·말씀 필드 (`titleDesign`, `churchName`, `serviceDate`, `customTitle*`, `themeId`, `testament`/`book`/`chapter` 등)
- 찬송가 `hymnNumber`, `hymnKorTitle`, `hymnEngTitle`, `originalUrl`
- 광고 제목·크기·정렬·불투명도, `adBgSource`가 URL이면 `adBgImageUrl`
- 커스텀 슬라이드 캔버스 모델. 로컬 `/uploads` 이미지 `src`는 안전한 빈 값으로 둔다
- 선택적 boolean `unrestorable`. 내보내기 중 로컬 자산을 제거했거나 원본 레코드가 이미 `unrestorable: true`이면 `true`다

빼는 것 (항상 `null`/false/빈 값):

- `serverFilePath`, `thumbnail`, `fileSaved`
- `adBgImagePath`
- `fileName`은 원래 파일명 문자열로 남긴다. 바이트는 없다
- `/uploads/` 경로와 `data:` URL(이미지·PPT 바이트 포함)은 모든 자산 필드에서 제거한다. `customImageData`, `adBgImageUrl`, `originalUrl`, 커스텀 캔버스 이미지 `src` 등에 적용한다
- 제거된 nullable 자산 필드는 `null`, 캔버스 이미지 `src`는 빈 값으로 정규화한다. 자산 값 자체를 sentinel로 사용하지 않는다
- 복원 불가 상태는 `unrestorable: true`에 기록한다. `sanitizeSlideForTemplate`은 이 값을 `Boolean`으로 보존하므로 Export→parse→`POST /api/templates` 저장→재Export 뒤에도 경고가 유지된다

`unrestorable`은 선택 필드다. 없는 기존 v1 문서는 계속 읽히며, 새 선택 필드 추가이므로 스키마 버전은 1을 유지한다. 원본 로컬 자산이 아직 남아 있으면 `toPortableSlide`가 기존 판별 규칙으로 `true`를 계산한다.

브라우저의 명시적 필드 allowlist인 `buildSerializableSlide`도 `unrestorable`을 Boolean으로 보존해야 한다. `cloneSlide`/`cloneTemplate`, 갤러리 캐시, 템플릿 저장 payload가 모두 이 경계를 사용하므로 서버 정규화만으로는 충분하지 않다.

`unrestorable: true`는 의도적으로 sticky다. 한 슬라이드에 PPTX, 광고 배경, 캔버스 이미지처럼 복수 자산이 빠질 수 있지만 현재 UI에는 누락 자산 전체를 검증하고 한 번에 복구하는 완전한 repair 작업이 없다. 개별 자산을 교체했다는 이유로 flag를 자동 해제하면 다른 누락 자산의 경고를 숨길 수 있다. 따라서 가져온 슬라이드의 자산을 수동으로 모두 보완해도 경고가 남을 수 있으며, 향후 완전한 자산 검증/복구 기능이 생길 때만 안전하게 해제한다.

복원 가능:

- 타이틀 / Custom 타이틀 / 말씀 본문 메타
- 찬송가: 번호와 `originalUrl`이 있으면 PPT 생성·미리보기 때 기존 `/api/hymn/download`로 다시 받는다
- 광고: URL 배경은 유지, 파일 배경은 빠짐
- 커스텀 슬라이드: 도형·텍스트는 유지, 로컬 이미지는 빈 자리

복원 불가 (슬라이드 자리는 남기고 파일만 없음):

- 직접 올린 PPT/PPTX (`sourceType`이 upload이거나 `serverFilePath`만 있고 `originalUrl`이 없음)
- 광고 파일 배경
- 커스텀 슬라이드의 로컬 업로드 이미지
- 경로만 있는 사용자 배경 이미지 (`customImageData`의 `/uploads/` 또는 `data:` URL)
- `data:` URL로 넣은 광고 URL 배경·캔버스 이미지

Export와 Import 모두 복원 불가 슬라이드 **이름 목록**을 사용자에게 보여 준다. Export는 확인 후에 다운로드하고, Import는 새 템플릿을 만든 뒤에 알려 준다. 확인을 거절하면 다운로드하지 않는다.

## UI

- 템플릿 카드 `⋯` 메뉴: `이름 변경`과 `삭제` 사이에 **스키마 내보내기**
- 템플릿 갤러리(빈 화면 포함): **스키마 가져오기**. 숨은 `input type="file"` `accept=".json,.samil-template.json"`
- 템플릿 작업 공간 안에서는 이 버튼을 갤러리와 같이 쓰지 않는다. Export는 카드 메뉴만 담당한다
- 가져온 이름은 JSON의 `template.name`이다. 같은 이름이 있어도 접미사 없이 카드가 하나 더 생긴다

알림은 앱이 이미 쓰는 저장/실패 알림과 같은 채널을 쓴다. 새 모달 프레임워크는 만들지 않는다. Export의 복원 불가 확인만 `confirm`이면 충분하다.

## 데이터 흐름

1. Export: 갤러리 캐시의 해당 템플릿을 `toPortableTemplateSchema(template)`로 변환한다. 복원 불가 목록이 있으면 확인한다. 확인되면 JSON을 브라우저에서 다운로드한다. 서버에 쓰지 않는다.
2. Import: 파일을 읽고 `parseTemplateSchema(text)`가 `kind`·`version`·마이그레이션·슬라이드 배열을 검증한다. 실패면 에러만 보여 준다.
3. 통과하면 기존 `POST /api/templates`에 `{ name, slides }`를 보낸다. 슬라이드는 이식 형태로, 로컬 경로가 없는 상태다.
4. 성공 응답이 유효한 템플릿 id·name·slides를 포함하는지 확인한다. 유효할 때만 갤러리 캐시에 push하고 카드를 다시 그린 뒤 복원 불가 목록을 알린다.

변환과 검증은 `lib/`의 순수 함수로 둔다. 브라우저와 테스트가 같은 규칙을 쓴다. 새 HTTP 엔드포인트는 없다.

`POST /api/templates`는 지금처럼 슬라이드가 하나 이상이어야 한다. 빈 슬라이드 배열 JSON은 Import하지 않는다.

## 실패 처리

| 상황 | 동작 |
|---|---|
| JSON 파싱 실패 | 가져오지 않고 오류 알림 |
| `kind` 불일치 | 가져오지 않고 오류 알림 |
| `version` 없음·비정수 | 가져오지 않고 오류 알림 |
| `version`이 MAX보다 큼 | 가져오지 않고, 앱 업데이트 안내 |
| `version`이 MIN보다 작음 | 가져오지 않고, 너무 옛 형식이라고 안내 |
| `template.name` 없음·슬라이드 없음 | 가져오지 않고 오류 알림 |
| `POST /api/templates` 실패 | 갤러리를 바꾸지 않고 오류 알림 |
| 성공 HTTP 응답이 JSON이 아니거나 유효한 템플릿 payload가 없음 | 갤러리를 바꾸지 않고 일반 가져오기 실패 알림 |
| Export 대상 템플릿이 캐시에 없음 | 다운로드하지 않음 |

## 테스트

- 로컬 `serverFilePath`/`thumbnail`/`adBgImagePath`가 있는 템플릿을 이식 JSON으로 바꾸면 그 필드가 비고, 타이틀 필드·찬송가 번호·`originalUrl`은 남는다
- 복원 불가 슬라이드 이름 목록이 올린 PPT와 파일 배경을 포함하고, URL만 있는 찬송가는 포함하지 않는다
- `kind`가 다르면 parse가 실패한다
- `version`이 2이면(현재 MAX가 1) parse가 실패하고, 앱 업데이트 안내 코드를 담는다
- `version`이 빠진 파일은 parse가 실패한다
- Export JSON의 `version`은 항상 `TEMPLATE_SCHEMA_VERSION`(1)이다
- 같은 이름을 두 번 Import하면 갤러리에 템플릿이 두 개가 된다 (라우트 테스트 또는 함수+기존 create 경로)

브라우저 E2E는 이 범위에 넣지 않는다. 순수 함수와 기존 템플릿 생성 API면 충분하다.
