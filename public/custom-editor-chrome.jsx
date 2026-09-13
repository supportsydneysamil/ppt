import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Circle,
  Copy,
  ImagePlus,
  Italic,
  Layers,
  Minus,
  Redo2,
  Square,
  SquareDashed,
  Trash2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";

import { ColorPicker } from "./color-picker.jsx";
import { CUSTOM_SLIDE_TEMPLATES } from "./custom-slide-editor.js";
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

export function CustomEditorChrome() {
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
          <span className="field-label">배경색</span>
          <ColorPicker
            value="#ffffff"
            background
            title="슬라이드 배경색"
            ariaLabel="슬라이드 배경색"
          />
        </label>
        <div className="custom-editor-zoom">
          <button type="button" className="custom-editor-tool" data-editor-action="zoom-out" aria-label="축소" title="축소">
            −
          </button>
          <button type="button" className="custom-editor-tool" data-editor-action="zoom-fit" aria-label="화면에 맞춤" title="화면에 맞춤">
            맞춤
          </button>
          <button type="button" className="custom-editor-tool" data-editor-action="zoom-in" aria-label="확대" title="확대">
            +
          </button>
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
            <AlignLeft size={16} />
          </ToolButton>
          <ToolButton action="align-center" label="가로 가운데 정렬">
            <AlignCenter size={16} />
          </ToolButton>
          <ToolButton action="align-right" label="오른쪽 정렬">
            <AlignRight size={16} />
          </ToolButton>
          <ToolButton action="align-top" label="위쪽 정렬">
            <ArrowUpToLine size={16} />
          </ToolButton>
          <ToolButton action="align-middle" label="세로 가운데 정렬">
            <Layers size={16} />
          </ToolButton>
          <ToolButton action="align-bottom" label="아래쪽 정렬">
            <ArrowDownToLine size={16} />
          </ToolButton>
        </div>
        <div className="custom-editor-tool-group" role="group" aria-label="개체 간 정렬">
          <ToolButton action="align-selection-left" label="선택 왼쪽 정렬">
            선택 왼쪽
          </ToolButton>
          <ToolButton action="distribute-x" label="가로 균등 분배">
            가로 분배
          </ToolButton>
          <ToolButton action="distribute-y" label="세로 균등 분배">
            세로 분배
          </ToolButton>
        </div>
        <div className="custom-editor-tool-group" role="group" aria-label="개체 관리">
          <ToolButton action="forward" label="앞으로 가져오기">
            앞으로
          </ToolButton>
          <ToolButton action="backward" label="뒤로 보내기">
            뒤로
          </ToolButton>
          <ToolButton action="to-front" label="맨 앞으로">
            맨 앞
          </ToolButton>
          <ToolButton action="to-back" label="맨 뒤로">
            맨 뒤
          </ToolButton>
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

      <div className="custom-editor-side">
      <aside className="custom-editor-layers" aria-label="레이어">
        <div className="custom-editor-panel-label">레이어</div>
        <ol data-editor-ui="layers" className="custom-editor-layer-list"></ol>
      </aside>

      <aside className="custom-editor-props" aria-label="선택 개체 속성">
        <div className="custom-editor-panel" data-editor-panel="empty">
          <p className="hint">개체를 선택하면 속성이 표시됩니다.</p>
        </div>
        <div className="custom-editor-panel" data-editor-panel="text" hidden>
          <div className="custom-editor-panel-label">텍스트</div>
          <label className="custom-editor-row">
            <span className="field-label">내용</span>
            <textarea rows="3" data-editor-field="text" aria-label="텍스트 내용"></textarea>
          </label>
          <label className="custom-editor-row">
            <span className="field-label">글꼴</span>
            <FontSelect />
          </label>
          <label className="custom-editor-row">
            <span className="field-label">크기</span>
            <input type="number" min="8" max="400" step="1" data-editor-field="fontSize" aria-label="텍스트 크기" />
          </label>
          <label className="custom-editor-row custom-editor-row-inline">
            <input type="checkbox" data-editor-field="bold" aria-label="굵게" />
            <span className="field-label">굵게</span>
          </label>
          <label className="custom-editor-row custom-editor-row-inline">
            <input type="checkbox" data-editor-field="italic" aria-label="기울임" />
            <span className="field-label">기울임</span>
          </label>
          <label className="custom-editor-row custom-editor-row-inline">
            <input type="checkbox" data-editor-field="underline" aria-label="밑줄" />
            <span className="field-label">밑줄</span>
          </label>
          <label className="custom-editor-row">
            <span className="field-label">글자색</span>
            <ColorPicker field="color" value="#000000" ariaLabel="글자색" />
          </label>
          <label className="custom-editor-row">
            <span className="field-label">정렬</span>
            <select data-editor-field="textAlign" aria-label="텍스트 정렬">
              <option value="left">왼쪽</option>
              <option value="center">가운데</option>
              <option value="right">오른쪽</option>
            </select>
          </label>
          <label className="custom-editor-row">
            <span className="field-label">세로 정렬</span>
            <select data-editor-field="valign" aria-label="텍스트 세로 정렬">
              <option value="top">상단</option>
              <option value="middle">가운데</option>
              <option value="bottom">하단</option>
            </select>
          </label>
          <label className="custom-editor-row">
            <span className="field-label">행간</span>
            <input type="number" min="0.8" max="3" step="0.05" data-editor-field="lineHeight" aria-label="행간" />
          </label>
          <label className="custom-editor-row">
            <span className="field-label">자간</span>
            <input type="number" min="-50" max="200" step="1" data-editor-field="charSpacing" aria-label="자간" />
          </label>
        </div>
        <div className="custom-editor-panel" data-editor-panel="image" hidden>
          <div className="custom-editor-panel-label">이미지</div>
          <label className="custom-editor-row">
            <span className="field-label">맞춤</span>
            <select data-editor-field="fit" aria-label="이미지 맞춤 방식">
              <option value="contain">전체 보이기 (contain)</option>
              <option value="cover">영역 채우기 (cover)</option>
            </select>
          </label>
        </div>
        <div className="custom-editor-panel" data-editor-panel="shape" hidden>
          <div className="custom-editor-panel-label">도형</div>
          <label className="custom-editor-row">
            <span className="field-label">채우기</span>
            <ColorPicker field="fill" value="#cccccc" ariaLabel="도형 채우기 색" />
          </label>
          <label className="custom-editor-row custom-editor-row-inline">
            <input type="checkbox" data-editor-field="noStroke" aria-label="선 없음" />
            <span className="field-label">선 없음</span>
          </label>
          <label className="custom-editor-row">
            <span className="field-label">선 색</span>
            <ColorPicker field="stroke" value="#000000" ariaLabel="도형 선 색" />
          </label>
          <label className="custom-editor-row">
            <span className="field-label">선 두께</span>
            <input type="number" min="0" max="100" step="1" data-editor-field="strokeWidth" aria-label="도형 선 두께" />
          </label>
        </div>
        <div className="custom-editor-panel" data-editor-panel="common" hidden>
          <div className="custom-editor-panel-label">공통</div>
          <label className="custom-editor-row">
            <span className="field-label">투명도</span>
            <input type="range" min="0" max="1" step="0.05" data-editor-field="opacity" aria-label="투명도" />
          </label>
          <label className="custom-editor-row">
            <span className="field-label">회전</span>
            <input type="number" min="0" max="359" step="1" data-editor-field="rotation" aria-label="회전 각도" />
          </label>
          <label className="custom-editor-row custom-editor-row-inline">
            <input type="checkbox" data-editor-field="locked" aria-label="잠금" />
            <span className="field-label">잠금</span>
          </label>
          <label className="custom-editor-row custom-editor-row-inline">
            <input type="checkbox" data-editor-field="visible" aria-label="표시" defaultChecked />
            <span className="field-label">표시</span>
          </label>
          <label className="custom-editor-row custom-editor-row-inline">
            <input type="checkbox" data-editor-field="shadowEnabled" aria-label="그림자" />
            <span className="field-label">그림자</span>
          </label>
          <label className="custom-editor-row">
            <span className="field-label">그림자 색</span>
            <ColorPicker field="shadowColor" value="#000000" ariaLabel="그림자 색" />
          </label>
        </div>
      </aside>
      </div>
    </div>
  );
}
