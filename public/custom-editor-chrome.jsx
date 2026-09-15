import {
  AlignHorizontalDistributeCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowLeftRight,
  ArrowUpDown,
  Bold,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Circle,
  Contrast,
  Copy,
  Eye,
  FlipHorizontal2,
  FlipVertical2,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Layers,
  Lock,
  Maximize,
  MousePointerClick,
  Minus,
  Redo2,
  RefreshCw,
  Settings2,
  Square,
  SquareDashed,
  Trash2,
  Type,
  Underline,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useId, useRef, useState } from "react";

import { ColorPicker } from "./color-picker.jsx";
import {
  CUSTOM_EDITOR_RIBBON_TABS,
  ribbonTabIndexForKey,
} from "./custom-editor-ribbon.js";
import { CUSTOM_SLIDE_TEMPLATES } from "./custom-slide-editor.js";
import { CUSTOM_SLIDE_THEMES } from "./custom-slide-themes.js";
import { SAFE_SLIDE_FONTS } from "./custom-slide-fonts.js";

function ToolButton({ action, label, children, danger = false, ...props }) {
  return (
    <button
      type="button"
      className={`custom-editor-tool${danger ? " danger" : ""}`}
      data-editor-action={action}
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}

function FontSelect() {
  return (
    <select data-editor-field="fontFamily" aria-label="텍스트 글꼴" className="font-preview-select">
      {SAFE_SLIDE_FONTS.map((font) => (
        <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
          {font.label}
        </option>
      ))}
    </select>
  );
}

function PanelLabel({ icon: Icon, children }) {
  return (
    <div className="custom-editor-panel-label">
      <Icon size={13} aria-hidden="true" />
      {children}
    </div>
  );
}

/* The editor reads and writes these through `input.checked`, so the checkbox
   stays a checkbox — visually hidden on top of the face that replaces it,
   which keeps it clickable and keyboard reachable. */
function StyleToggle({ field, label, children }) {
  return (
    <label className="custom-editor-toggle" title={label}>
      <input type="checkbox" data-editor-field={field} aria-label={label} />
      <span className="custom-editor-toggle-face" aria-hidden="true">
        {children}
      </span>
    </label>
  );
}

function CheckChip({ field, label, defaultChecked = false, children }) {
  return (
    <label className="custom-editor-chip">
      <input
        type="checkbox"
        data-editor-field={field}
        aria-label={label}
        defaultChecked={defaultChecked}
      />
      <span className="custom-editor-chip-face">
        {children}
        {label}
      </span>
    </label>
  );
}

function RibbonGroup({ label, className = "", children }) {
  return (
    <div
      className={`custom-editor-ribbon-group ${className}`.trim()}
      role="group"
      aria-label={label}
    >
      <div className="custom-editor-ribbon-group-controls">{children}</div>
      <span className="custom-editor-ribbon-group-label">{label}</span>
    </div>
  );
}

/**
 * `inspectorHost` is where the layers and object properties should render. The
 * workspace passes the slot inside its inspector form, so the name/type fields
 * and these panels share one scroll container instead of the panels sitting in
 * a second column of their own. The popout window has no such form and leaves
 * it unset, which keeps the panels inside the editor where they started.
 */
export function CustomEditorChrome({ inspectorHost = null }) {
  const [activeRibbonTab, setActiveRibbonTab] = useState("design");
  const ribbonId = useId();
  const ribbonTabRefs = useRef([]);

  function activateRibbonTab(index, focus = false) {
    const tab = CUSTOM_EDITOR_RIBBON_TABS[index];
    if (!tab) return;
    setActiveRibbonTab(tab.id);
    if (focus) {
      requestAnimationFrame(() => ribbonTabRefs.current[index]?.focus());
    }
  }

  function handleRibbonTabKeyDown(event, index) {
    const nextIndex = ribbonTabIndexForKey(event.key, index);
    if (nextIndex === null) return;
    event.preventDefault();
    activateRibbonTab(nextIndex, true);
  }

  const inspector = (
    <div className="custom-editor-side" id="customSlideInspector">
      <aside className="custom-editor-layers" aria-label="레이어">
        <PanelLabel icon={Layers}>레이어</PanelLabel>
        <p className="hint">
          겹쳐서 클릭하기 어려운 개체를 골라내고, 숨기거나 잠그고, 끌어서 앞뒤 순서를 바꿉니다.
        </p>
        <ol data-editor-ui="layers" className="custom-editor-layer-list"></ol>
        <p className="hint" data-editor-ui="layers-empty">
          아직 개체가 없습니다. 위 도구로 추가해 보세요.
        </p>
      </aside>

      <aside className="custom-editor-props" aria-label="선택 개체 속성">
        <div className="custom-editor-panel" data-editor-panel="empty">
          <div className="custom-editor-empty">
            <MousePointerClick size={18} aria-hidden="true" />
            <p>캔버스에서 개체를 선택하면 속성이 여기에 표시됩니다.</p>
          </div>
        </div>

        <div className="custom-editor-panel" data-editor-panel="text" hidden>
          <PanelLabel icon={Type}>텍스트</PanelLabel>
          <label className="custom-editor-row custom-editor-row--stack">
            <span className="field-label">내용</span>
            <textarea rows="3" data-editor-field="text" aria-label="텍스트 내용"></textarea>
          </label>
          <label className="custom-editor-row">
            <span className="field-label">글꼴</span>
            <FontSelect />
          </label>
          {/* Size and the three style toggles are one decision about how the
              glyphs look, so they share a row instead of taking four. */}
          <div className="custom-editor-row">
            <span className="field-label">크기</span>
            <div className="custom-editor-controls">
              <span className="custom-editor-num">
                <input
                  type="number"
                  min="8"
                  max="400"
                  step="1"
                  data-editor-field="fontSize"
                  aria-label="텍스트 크기"
                />
              </span>
              <div className="custom-editor-toggle-group" role="group" aria-label="글자 스타일">
                <StyleToggle field="bold" label="굵게">
                  <Bold size={14} />
                </StyleToggle>
                <StyleToggle field="italic" label="기울임">
                  <Italic size={14} />
                </StyleToggle>
                <StyleToggle field="underline" label="밑줄">
                  <Underline size={14} />
                </StyleToggle>
              </div>
            </div>
          </div>
          <label className="custom-editor-row">
            <span className="field-label">글자색</span>
            <ColorPicker field="color" value="#000000" ariaLabel="글자색" />
          </label>
          <div className="custom-editor-row">
            <span className="field-label">정렬</span>
            <div className="custom-editor-controls">
              <span className="custom-editor-inline-field">
                <ArrowLeftRight size={13} aria-hidden="true" />
                <select data-editor-field="textAlign" aria-label="텍스트 가로 정렬" title="가로 정렬">
                  <option value="left">왼쪽</option>
                  <option value="center">가운데</option>
                  <option value="right">오른쪽</option>
                </select>
              </span>
              <span className="custom-editor-inline-field">
                <ArrowUpDown size={13} aria-hidden="true" />
                <select data-editor-field="valign" aria-label="텍스트 세로 정렬" title="세로 정렬">
                  <option value="top">위</option>
                  <option value="middle">가운데</option>
                  <option value="bottom">아래</option>
                </select>
              </span>
            </div>
          </div>
          <div className="custom-editor-row">
            <span className="field-label">간격</span>
            <div className="custom-editor-controls">
              <span className="custom-editor-subfield">
                <span className="custom-editor-sublabel">행간</span>
                <input type="number" min="0.8" max="3" step="0.05" data-editor-field="lineHeight" aria-label="행간" />
              </span>
              <span className="custom-editor-subfield">
                <span className="custom-editor-sublabel">자간</span>
                <input type="number" min="-50" max="200" step="1" data-editor-field="charSpacing" aria-label="자간" />
              </span>
            </div>
          </div>
        </div>

        <div className="custom-editor-panel" data-editor-panel="image" hidden>
          <PanelLabel icon={ImageIcon}>이미지</PanelLabel>
          <div className="custom-editor-image-actions">
            <button
              type="button"
              className="ghost small"
              data-editor-action="replace-image"
            >
              <RefreshCw size={14} aria-hidden="true" />
              이미지 교체
            </button>
          </div>
          <div className="custom-editor-row">
            <span className="field-label">표시 방식</span>
            <div className="custom-editor-fit-segment" role="radiogroup" aria-label="이미지 표시 방식">
              <label className="custom-editor-fit-option">
                <input type="radio" value="contain" data-editor-field="fit" name={`${ribbonId}-imageFit`} />
                <span>맞춤</span>
              </label>
              <label className="custom-editor-fit-option">
                <input type="radio" value="cover" data-editor-field="fit" name={`${ribbonId}-imageFit`} />
                <span>채우기</span>
              </label>
            </div>
          </div>
          <div className="custom-editor-row">
            <span className="field-label">뒤집기</span>
            <div className="custom-editor-controls">
              <CheckChip field="flipH" label="좌우 뒤집기">
                <FlipHorizontal2 size={13} />
              </CheckChip>
              <CheckChip field="flipV" label="상하 뒤집기">
                <FlipVertical2 size={13} />
              </CheckChip>
            </div>
          </div>
          <label className="custom-editor-row custom-editor-row--stack custom-editor-image-alt">
            <span className="field-label">대체 텍스트 <span className="custom-editor-sublabel">선택</span></span>
            <textarea
              rows="2"
              maxLength={500}
              data-editor-field="altText"
              aria-label="이미지 대체 텍스트"
              placeholder="이미지의 내용이나 목적을 설명하세요"
            ></textarea>
          </label>
          <p className="hint">
            맞춤은 전체 이미지를 보이고, 채우기는 프레임을 빈틈없이 채웁니다.
          </p>
        </div>

        <div className="custom-editor-panel" data-editor-panel="shape" hidden>
          <PanelLabel icon={Square}>도형</PanelLabel>
          <label className="custom-editor-row">
            <span className="field-label">채우기</span>
            <ColorPicker field="fill" value="#cccccc" ariaLabel="도형 채우기 색" />
          </label>
          <label className="custom-editor-row">
            <span className="field-label">선 색</span>
            <ColorPicker field="stroke" value="#000000" ariaLabel="도형 선 색" />
          </label>
          <div className="custom-editor-row">
            <span className="field-label">선 두께</span>
            <div className="custom-editor-controls">
              <span className="custom-editor-num">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  data-editor-field="strokeWidth"
                  aria-label="도형 선 두께"
                />
              </span>
              <CheckChip field="noStroke" label="선 없음">
                <Minus size={13} />
              </CheckChip>
            </div>
          </div>
        </div>

        <div className="custom-editor-panel" data-editor-panel="common" hidden>
          <PanelLabel icon={Settings2}>공통</PanelLabel>
          <div className="custom-editor-row">
            <span className="field-label">투명도</span>
            <div className="custom-editor-controls">
              <input type="range" min="0" max="1" step="0.05" data-editor-field="opacity" aria-label="투명도" />
              <output className="custom-editor-readout" data-editor-readout="opacity">
                100%
              </output>
            </div>
          </div>
          <label className="custom-editor-row">
            <span className="field-label">회전</span>
            <span className="custom-editor-num">
              <input
                type="number"
                min="0"
                max="359"
                step="1"
                data-editor-field="rotation"
                aria-label="회전 각도"
              />
            </span>
          </label>
          <div className="custom-editor-checks">
            <CheckChip field="visible" label="표시" defaultChecked>
              <Eye size={13} />
            </CheckChip>
            <CheckChip field="locked" label="잠금">
              <Lock size={13} />
            </CheckChip>
            <CheckChip field="shadowEnabled" label="그림자">
              <Contrast size={13} />
            </CheckChip>
          </div>
          <label className="custom-editor-row" data-editor-dependent="shadowEnabled">
            <span className="field-label">그림자색</span>
            <ColorPicker field="shadowColor" value="#000000" ariaLabel="그림자 색" />
          </label>
        </div>
      </aside>
    </div>
  );

  return (
    <div className="custom-editor-chrome">
      <div className="custom-editor-ribbon">
        <div className="custom-editor-ribbon-tabbar">
          <div
            className="custom-editor-ribbon-tablist"
            role="tablist"
            aria-label="편집 도구 카테고리"
          >
            {CUSTOM_EDITOR_RIBBON_TABS.map((tab, index) => {
              const selected = activeRibbonTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(node) => {
                    ribbonTabRefs.current[index] = node;
                  }}
                  id={`${ribbonId}-${tab.id}-tab`}
                  type="button"
                  className="custom-editor-ribbon-tab"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${ribbonId}-${tab.id}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => activateRibbonTab(index)}
                  onKeyDown={(event) => handleRibbonTabKeyDown(event, index)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div
            className="custom-editor-ribbon-quick-access"
            role="group"
            aria-label="편집 이력"
          >
            <ToolButton action="undo" label="실행 취소">
              <Undo2 size={16} />
            </ToolButton>
            <ToolButton action="redo" label="다시 실행">
              <Redo2 size={16} />
            </ToolButton>
          </div>
        </div>

        <div
          id={`${ribbonId}-design-panel`}
          className="custom-editor-ribbon-panel"
          role="tabpanel"
          aria-labelledby={`${ribbonId}-design-tab`}
          hidden={activeRibbonTab !== "design"}
        >
          <RibbonGroup label="템플릿">
            <label className="custom-editor-field custom-editor-ribbon-field">
              <span className="visually-hidden">템플릿</span>
              <select
                data-custom-editor="template"
                aria-label="커스텀 슬라이드 템플릿"
                title="커스텀 슬라이드 템플릿"
              >
                {CUSTOM_SLIDE_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ghost small"
              data-editor-action="apply-template"
              title="선택한 템플릿 적용"
              aria-label="선택한 템플릿 적용"
            >
              적용
            </button>
          </RibbonGroup>
          <RibbonGroup label="테마 및 배경">
            <label className="custom-editor-field custom-editor-ribbon-field">
              <span className="visually-hidden">테마</span>
              <select
                data-custom-editor="theme"
                aria-label="커스텀 슬라이드 테마"
                title="커스텀 슬라이드 테마"
              >
                {CUSTOM_SLIDE_THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="custom-editor-field custom-editor-ribbon-field">
              <span className="visually-hidden">배경색</span>
              <ColorPicker
                value="#ffffff"
                background
                title="슬라이드 배경색"
                ariaLabel="슬라이드 배경색"
              />
            </label>
          </RibbonGroup>
          <RibbonGroup label="보기" className="custom-editor-ribbon-view-group">
            <ToolButton action="zoom-out" label="축소">
              <ZoomOut size={16} />
            </ToolButton>
            <ToolButton action="zoom-fit" label="화면에 맞춤">
              <Maximize size={16} />
            </ToolButton>
            <ToolButton action="zoom-in" label="확대">
              <ZoomIn size={16} />
            </ToolButton>
          </RibbonGroup>
        </div>

        <div
          id={`${ribbonId}-insert-panel`}
          className="custom-editor-ribbon-panel"
          role="tabpanel"
          aria-labelledby={`${ribbonId}-insert-tab`}
          hidden={activeRibbonTab !== "insert"}
        >
          <RibbonGroup label="콘텐츠">
            <ToolButton action="add-text" label="텍스트 추가">
              <Type size={16} />
            </ToolButton>
            <ToolButton action="add-image" label="이미지 추가">
              <ImagePlus size={16} />
            </ToolButton>
          </RibbonGroup>
          <RibbonGroup label="도형">
            <ToolButton action="add-rect" label="사각형 추가">
              <Square size={16} />
            </ToolButton>
            <ToolButton action="add-roundRect" label="둥근 사각형 추가">
              <SquareDashed size={16} />
            </ToolButton>
            <ToolButton action="add-ellipse" label="원 추가">
              <Circle size={16} />
            </ToolButton>
            <ToolButton action="add-line" label="선 추가">
              <Minus size={16} />
            </ToolButton>
          </RibbonGroup>
        </div>

        <div
          id={`${ribbonId}-align-panel`}
          className="custom-editor-ribbon-panel"
          role="tabpanel"
          aria-labelledby={`${ribbonId}-align-tab`}
          hidden={activeRibbonTab !== "align"}
        >
          <RibbonGroup label="슬라이드에 맞춤">
            <ToolButton action="align-left" label="왼쪽 정렬">
              <AlignHorizontalJustifyStart size={16} />
            </ToolButton>
            <ToolButton action="align-center" label="가로 가운데 정렬">
              <AlignHorizontalJustifyCenter size={16} />
            </ToolButton>
            <ToolButton action="align-right" label="오른쪽 정렬">
              <AlignHorizontalJustifyEnd size={16} />
            </ToolButton>
            <ToolButton action="align-top" label="위쪽 정렬">
              <AlignVerticalJustifyStart size={16} />
            </ToolButton>
            <ToolButton action="align-middle" label="세로 가운데 정렬">
              <AlignVerticalJustifyCenter size={16} />
            </ToolButton>
            <ToolButton action="align-bottom" label="아래쪽 정렬">
              <AlignVerticalJustifyEnd size={16} />
            </ToolButton>
          </RibbonGroup>
          <RibbonGroup label="선택 개체에 맞춤">
            <ToolButton action="align-selection-left" label="선택 개체 왼쪽 정렬">
              <AlignStartVertical size={16} />
            </ToolButton>
            <ToolButton action="distribute-x" label="가로 균등 분배">
              <AlignHorizontalDistributeCenter size={16} />
            </ToolButton>
            <ToolButton action="distribute-y" label="세로 균등 분배">
              <AlignVerticalDistributeCenter size={16} />
            </ToolButton>
          </RibbonGroup>
        </div>

        <div
          id={`${ribbonId}-arrange-panel`}
          className="custom-editor-ribbon-panel"
          role="tabpanel"
          aria-labelledby={`${ribbonId}-arrange-tab`}
          hidden={activeRibbonTab !== "arrange"}
        >
          <RibbonGroup label="쌓는 순서">
            <ToolButton action="to-front" label="맨 앞으로">
              <ChevronsUp size={16} />
            </ToolButton>
            <ToolButton action="forward" label="앞으로 가져오기">
              <ChevronUp size={16} />
            </ToolButton>
            <ToolButton action="backward" label="뒤로 보내기">
              <ChevronDown size={16} />
            </ToolButton>
            <ToolButton action="to-back" label="맨 뒤로">
              <ChevronsDown size={16} />
            </ToolButton>
          </RibbonGroup>
          <RibbonGroup label="개체 관리">
            <ToolButton action="duplicate" label="개체 복제">
              <Copy size={16} />
            </ToolButton>
            <ToolButton action="delete" label="개체 삭제" danger>
              <Trash2 size={16} />
            </ToolButton>
          </RibbonGroup>
        </div>
      </div>

      <div className="custom-editor-context-toolbar" data-editor-ui="context-toolbar" hidden>
        <ToolButton action="bold" label="굵게">
          <Bold size={14} />
        </ToolButton>
        <ToolButton action="italic" label="기울임">
          <Italic size={14} />
        </ToolButton>
        <ToolButton action="underline" label="밑줄">
          <Underline size={14} />
        </ToolButton>
        <input type="number" min="8" max="400" data-editor-field="fontSize" aria-label="텍스트 크기" />
        <ColorPicker field="color" value="#000000" ariaLabel="글자색" />
      </div>

      <ul className="custom-editor-context-menu" data-editor-ui="context-menu" hidden>
        <li>
          <button type="button" data-editor-action="copy">
            복사
          </button>
        </li>
        <li>
          <button type="button" data-editor-action="paste">
            붙여넣기
          </button>
        </li>
        <li>
          <button type="button" data-editor-action="duplicate">
            복제
          </button>
        </li>
        <li>
          <button type="button" data-editor-action="to-front">
            맨 앞으로
          </button>
        </li>
        <li>
          <button type="button" data-editor-action="forward">
            앞으로
          </button>
        </li>
        <li>
          <button type="button" data-editor-action="backward">
            뒤로
          </button>
        </li>
        <li>
          <button type="button" data-editor-action="to-back">
            맨 뒤로
          </button>
        </li>
        <li>
          <button type="button" className="danger" data-editor-action="delete">
            삭제
          </button>
        </li>
      </ul>

      {inspectorHost ? createPortal(inspector, inspectorHost) : inspector}
    </div>
  );
}
