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
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Layers,
  Lock,
  Maximize,
  MousePointerClick,
  Minus,
  Redo2,
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

import { ColorPicker } from "./color-picker.jsx";
import { CUSTOM_SLIDE_TEMPLATES } from "./custom-slide-editor.js";
import { CUSTOM_SLIDE_THEMES } from "./custom-slide-themes.js";
import { SAFE_SLIDE_FONTS } from "./custom-slide-fonts.js";

function ToolButton({ action, label, children, danger = false }) {
  return (
    <button
      type="button"
      className={`custom-editor-tool${danger ? " danger" : ""}`}
      data-editor-action={action}
      title={label}
      aria-label={label}
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

/**
 * `inspectorHost` is where the layers and object properties should render. The
 * workspace passes the slot inside its inspector form, so the name/type fields
 * and these panels share one scroll container instead of the panels sitting in
 * a second column of their own. The popout window has no such form and leaves
 * it unset, which keeps the panels inside the editor where they started.
 */
export function CustomEditorChrome({ inspectorHost = null }) {
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
          <label className="custom-editor-row">
            <span className="field-label">맞춤</span>
            <select data-editor-field="fit" aria-label="이미지 맞춤 방식">
              <option value="contain">전체 보이기</option>
              <option value="cover">영역 채우기</option>
            </select>
          </label>
          <p className="hint">
            전체 보이기는 이미지를 자르지 않고, 영역 채우기는 빈 공간 없이 채웁니다.
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
      <div className="custom-editor-bar">
        <label className="custom-editor-field">
          <span className="field-label">템플릿</span>
          <select data-custom-editor="template" aria-label="커스텀 슬라이드 템플릿" title="커스텀 슬라이드 템플릿">
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
          템플릿 적용
        </button>
        <label className="custom-editor-field">
          <span className="field-label">테마</span>
          <select data-custom-editor="theme" aria-label="커스텀 슬라이드 테마" title="커스텀 슬라이드 테마">
            {CUSTOM_SLIDE_THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
        <label className="custom-editor-field">
          <span className="field-label">배경색</span>
          <ColorPicker
            value="#ffffff"
            background
            title="슬라이드 배경색"
            ariaLabel="슬라이드 배경색"
          />
        </label>
        <div className="custom-editor-zoom" role="group" aria-label="확대/축소">
          <ToolButton action="zoom-out" label="축소">
            <ZoomOut size={16} />
          </ToolButton>
          <ToolButton action="zoom-fit" label="화면에 맞춤">
            <Maximize size={16} />
          </ToolButton>
          <ToolButton action="zoom-in" label="확대">
            <ZoomIn size={16} />
          </ToolButton>
        </div>
      </div>

      <div className="custom-editor-toolbar" role="toolbar" aria-label="커스텀 슬라이드 도구">
        <div className="custom-editor-tool-group" role="group" aria-label="개체 추가">
          <ToolButton action="add-text" label="텍스트 추가">
            <Type size={16} />
          </ToolButton>
          <ToolButton action="add-image" label="이미지 추가">
            <ImagePlus size={16} />
          </ToolButton>
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
        </div>
        <div className="custom-editor-tool-group" role="group" aria-label="편집 이력">
          <ToolButton action="undo" label="실행 취소">
            <Undo2 size={16} />
          </ToolButton>
          <ToolButton action="redo" label="다시 실행">
            <Redo2 size={16} />
          </ToolButton>
        </div>
        <div className="custom-editor-tool-group" role="group" aria-label="슬라이드 기준 정렬">
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
        </div>
        <div className="custom-editor-tool-group" role="group" aria-label="개체 간 정렬">
          <ToolButton action="align-selection-left" label="선택 개체 왼쪽 정렬">
            <AlignStartVertical size={16} />
          </ToolButton>
          <ToolButton action="distribute-x" label="가로 균등 분배">
            <AlignHorizontalDistributeCenter size={16} />
          </ToolButton>
          <ToolButton action="distribute-y" label="세로 균등 분배">
            <AlignVerticalDistributeCenter size={16} />
          </ToolButton>
        </div>
        {/* Top-to-bottom, to match the layer list these four reorder. The two
            layered-square icons lucide offers for the extremes are hard to
            tell apart at 16px, so the group reads as one scale instead. */}
        <div className="custom-editor-tool-group" role="group" aria-label="쌓는 순서">
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
        </div>
        <div className="custom-editor-tool-group" role="group" aria-label="개체 관리">
          <ToolButton action="duplicate" label="개체 복제">
            <Copy size={16} />
          </ToolButton>
          <ToolButton action="delete" label="개체 삭제" danger>
            <Trash2 size={16} />
          </ToolButton>
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
