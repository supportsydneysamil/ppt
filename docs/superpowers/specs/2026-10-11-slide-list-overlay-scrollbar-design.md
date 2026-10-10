# 슬라이드 목록 오버레이 스크롤바 (2026-10-11)

## 문제

슬라이드 목록(`.slide-cards`)은 스크롤바가 없다. `8cad8a0`에서 일부러 숨겼다.
macOS 스크롤바 설정이 "자동"이고 마우스가 연결되면 브라우저는 클래식 바를 그리고,
클래식 바는 폭 15px을 레이아웃에서 가져간다. 목록이 패널보다 길어지는 순간 카드가
옆으로 밀렸고, 같은 원리로 커스텀 편집 스테이지가 떨렸다. 바를 폭 0으로 숨겨 이를
막았지만, 목록이 스크롤된다는 시각 신호도 함께 사라졌다.

원하는 것은 평소에는 보이지 않다가 스크롤할 때만 나타나는 얇은 반투명 바다.
레이아웃 폭은 1px도 쓰지 않아야 한다.

## CSS로는 안 되는 이유

- 클래식 바 환경에서 특정 요소만 오버레이로 그리게 하는 CSS는 없다.
  `overflow: overlay`는 폐기되어 `auto`와 같다.
- `scrollbar-width: thin`과 `scrollbar-gutter`는 바를 얇게 하거나 자리를 고정할 뿐,
  자리 자체는 예약한다. 오른쪽 여백만 넓어지는 증상이 그대로 남는다.
- `::-webkit-scrollbar`에 폭을 주면 맥 크롬은 오히려 클래식 모드로 바뀐다.
- CSS에는 "스크롤 중" 상태가 없다. 할 수 있는 건 호버 시 표시까지다.

## 이전 시도

9월 16일 OverlayScrollbars 라이브러리를 넣었다가 되돌렸다. 확인된 함정 두 가지가
이번 설계의 제약이 된다.

- 라이브러리는 패널 자식을 자기 뷰포트로 감싸려 한다. 직접 만들면 DOM을 건드리지
  않는다.
- `renderSlideList()`가 `slideListContainer.innerHTML = ""`로 목록을 통째로 비워서,
  목록 안에 삽입된 바가 매 렌더마다 지워졌다. 이번 바는 목록 **바깥**에 둔다.

## 설계

### 원리

네이티브 스크롤은 그대로 둔다. 휠 관성, 트랙패드, 터치, 키보드, 접근성은 전부
브라우저가 처리한다. 네이티브 바는 지금처럼 폭 0으로 숨기고, 그 위에 막대(thumb)
하나를 직접 그린다. 막대는 목록의 `scrollTop`·`scrollHeight`·`clientHeight`만 읽어서
크기와 위치를 정한다.

### 모듈: `public/overlay-scrollbar.js`

`workspace-layout.js`처럼 순수 함수와 DOM 부착 함수를 나눈다.

- `computeThumb({ scrollTop, scrollHeight, clientHeight, trackLength, minSize })`
  넘치는 양이 1px 미만이면 `null`(막대 없음). 아니면 `{ size, offset }`.
  `size = max(minSize, trackLength × clientHeight / scrollHeight)`,
  `offset = (trackLength − size) × scrollTop / (scrollHeight − clientHeight)`,
  `offset`은 `[0, trackLength − size]`로 클램프한다. `minSize` 기본값은 24px.
- `scrollTopForDrag({ startScrollTop, deltaY, trackLength, thumbSize, scrollHeight, clientHeight })`
  막대 이동 거리를 스크롤 거리로 환산한다:
  `startScrollTop + deltaY × (scrollHeight − clientHeight) / (trackLength − thumbSize)`,
  `[0, scrollHeight − clientHeight]`로 클램프한다.
- `attachOverlayScrollbar(pane, { host = pane.parentElement, hideDelay = 800 })`
  트랙과 막대 엘리먼트를 `host`에 붙이고 `{ update, destroy }`를 돌려준다.

### 배치

트랙은 `.slide-list-panel`(이미 `position: relative`)의 자식이다. 목록이 다시
그려져도 지워지지 않는다. 위치는 목록 상자에 맞춘다: `top = pane.offsetTop`,
`height = pane.clientHeight`. `offsetTop`이 패널 기준이려면 패널이 위치 지정
요소여야 한다. 와이드(`relative`/`sticky`)와 컴팩트(`absolute`)는 그렇고, 패널이
`static`이 되는 모바일에서는 목록이 스크롤하지 않아 트랙이 숨어 있다.

트랙은 패널 오른쪽 안쪽 여백(16px)에 둔다. 패널 테두리에서 5px 들어온 자리에
6px 폭 막대, 호버·드래그 중에는 8px. 카드는 패널 패딩 16px과 목록의
`padding-right: 4px` 안쪽에서 끝나므로 막대는 카드와 겹치지 않는다. 카드 오른쪽
위 "더보기" 버튼도 가리지 않는다.

트랙과 막대는 장식이므로 `aria-hidden="true"`다.

### 표시와 숨김

- 목록의 `scrollTop`이 **실제로 바뀐** `scroll` 이벤트에서만 나타난다. 목록 재렌더로
  내용만 바뀌는 경우는 위치만 다시 계산하고 깜빡이지 않는다.
- 마지막 스크롤 후 `hideDelay`(800ms) 뒤 사라진다. 막대 위에 포인터가 있거나
  드래그 중이면 사라지지 않는다.
- 페이드는 CSS `opacity` 전환이다. `prefers-reduced-motion: reduce`에서는 전환 없이
  바로 나타나고 사라진다.
- 숨겨진 동안 막대는 `pointer-events: none`이라 오른쪽 여백 클릭을 가로채지 않는다.
- `computeThumb`가 `null`이면 트랙 자체를 숨긴다.

### 갱신 시점

- 목록 `scroll`(passive) → `requestAnimationFrame`으로 묶어서 갱신.
- `ResizeObserver(pane)` → 패널·창 크기 변화.
- `MutationObserver(pane, { childList: true })` → 카드 추가·삭제·재렌더.
  카드 수 변화는 목록 상자 크기를 바꾸지 않으므로 `ResizeObserver`로는 잡히지 않는다.

새 카드로 따라가는 `revealSlideCard()`는 `scrollIntoView`를 쓰므로 `scroll`
이벤트를 거쳐 막대가 함께 움직인다.

### 드래그

막대 `pointerdown` → `setPointerCapture`, 시작 `scrollTop`과 포인터 Y를 기록.
`pointermove`마다 `scrollTopForDrag`로 `pane.scrollTop`을 쓴다. `pointerup`·
`pointercancel`에서 해제하고 숨김 타이머를 다시 건다. 드래그 중 텍스트 선택은 막는다.

### 테마

막대 색은 `color-mix(in srgb, var(--ink) 32%, transparent)`, 호버·드래그 중 48%.
`--ink`가 테마마다 바뀌므로 다크에서는 밝은 반투명, 라이트에서는 어두운 반투명이
된다. 모서리는 완전히 둥글게.

### 배선

`app.js`가 `slideListContainer`를 잡은 뒤 한 번 호출한다:
`attachOverlayScrollbar(slideListContainer)`. `renderSlideList()`는 바꾸지 않는다.

`styles.css`의 네이티브 바 숨김 규칙과 그 테스트는 그대로 둔다. 규칙 위 주석에는
슬라이드 목록이 자기 막대를 그린다는 문장만 더한다.

## 레이아웃 모드별 동작

- **와이드(1280px 이상):** 기본 동작.
- **컴팩트 드로어(900–1279px):** 패널에 `overflow: auto`가 걸려 있다. 패널 자체가
  스크롤되더라도 트랙과 목록이 같은 스크롤 좌표 안에 있어 함께 움직인다.
  실제 화면에서 따로 확인한다.
- **접힘:** 기존 `.slide-list-panel > * { visibility: hidden }`이 트랙도 숨긴다.
- **모바일(900px 미만):** 목록이 `overflow-y: visible`이라 넘침이 없고,
  `computeThumb`가 `null`을 돌려 트랙이 숨는다.

## 비목표

- 다른 영역(상세 설정, 스테이지, 성경 텍스트, 템플릿 갤러리). 모듈은 범용으로
  만들지만 이번에는 슬라이드 목록에만 붙인다.
- 트랙 클릭으로 페이지 단위 이동, 가로 스크롤, 키보드로 포커스되는 막대.

## 테스트

- `test/overlay-scrollbar.test.js`: `computeThumb`(넘침 없음, 최소 크기, 맨 위·중간·
  맨 아래 위치, 클램프)와 `scrollTopForDrag`(비례 환산, 양끝 클램프).
- `test/ppt-workspace-ui.test.js`: `app.js`가 `slideListContainer`에 부착하는지,
  막대 CSS가 있는지 소스 텍스트로 확인. 기존 "스크롤바 거터 예약 없음" 테스트는
  변경 없이 통과해야 한다.

## 검증

막대는 우리가 그리는 DOM이므로 헤드리스 브라우저에서도 실제와 같게 보인다.
확인 항목: 스크롤 시 나타나고 800ms 뒤 사라짐, 목록 `clientWidth` 변화 없음,
드래그로 `scrollTop` 이동, 카드 추가·삭제·재렌더 후에도 막대 유지, 접힘·모바일에서
숨김, 컴팩트 드로어 정렬, 라이트·다크 테마 가시성.
