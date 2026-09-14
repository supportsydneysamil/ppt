export function syncCustomTitleDesignCards(designGrid, selectedId) {
  if (!designGrid) return;
  designGrid
    .querySelectorAll("[data-custom-title-design]")
    .forEach((card) => {
      const selected = card.dataset.customTitleDesign === selectedId;
      card.classList.toggle("is-active", selected);
      card.setAttribute("aria-pressed", String(selected));
    });
}

function createDesignCard(document, design, buildPreview) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "theme-option-card custom-title-design-card";
  card.dataset.customTitleDesign = design.id;
  card.setAttribute("aria-label", `${design.name} 디자인`);

  const preview = buildPreview(
    {
      customTitleDesign: design.id,
      customTitleKo: "예배",
      customTitleEn: "WORSHIP",
      customTitleSubtitle: "",
    },
    180
  );
  preview.classList.add("custom-title-card-preview");
  delete preview.dataset.customTitleDesign;
  card.appendChild(preview);

  const copy = document.createElement("span");
  copy.className = "theme-option-copy";
  const name = document.createElement("strong");
  name.textContent = design.name;
  const description = document.createElement("small");
  description.textContent = design.description;
  copy.append(name, description);
  card.appendChild(copy);
  return card;
}

function syncCategoryButtons(categoryGroup, activeCategoryId) {
  categoryGroup
    .querySelectorAll("[data-custom-title-category]")
    .forEach((button) => {
      const active = button.dataset.customTitleCategory === activeCategoryId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
}

export function createCustomTitleDesignPicker({
  document,
  categoryGroup,
  designGrid,
  designSelect,
  catalogApi,
  buildPreview,
  render = () => {},
  refreshDirty = () => {},
}) {
  if (
    !document ||
    !categoryGroup ||
    !designGrid ||
    !designSelect ||
    !catalogApi ||
    !buildPreview
  ) {
    return null;
  }

  function renderCards(categoryId) {
    designGrid.replaceChildren(
      ...catalogApi
        .listCustomTitleDesignsByCategory(categoryId)
        .map((design) =>
          createDesignCard(
            document,
            design,
            buildPreview
          )
        )
    );
    syncCustomTitleDesignCards(designGrid, designSelect.value);
  }

  function filter(categoryId) {
    const exists = catalogApi.CUSTOM_TITLE_DESIGN_CATEGORIES.some(
      (category) => category.id === categoryId
    );
    if (!exists) return false;
    syncCategoryButtons(categoryGroup, categoryId);
    renderCards(categoryId);
    return true;
  }

  function restore(value) {
    let selectedId = catalogApi.normalizeCustomTitleDesignId(value);
    let selectedDesign = catalogApi.findCustomTitleDesign(selectedId);
    if (!selectedDesign) {
      selectedId = catalogApi.DEFAULT_CUSTOM_TITLE_DESIGN_ID || "aurora";
      selectedDesign = catalogApi.findCustomTitleDesign(selectedId);
    }
    if (!selectedDesign) return null;

    designSelect.value = selectedId;
    filter(selectedDesign.categoryId);
    syncCustomTitleDesignCards(designGrid, selectedId);
    return selectedId;
  }

  categoryGroup.replaceChildren(
    ...catalogApi.CUSTOM_TITLE_DESIGN_CATEGORIES.map((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "custom-title-category-button";
      button.dataset.customTitleCategory = category.id;
      button.textContent = category.name;
      button.setAttribute("aria-label", `${category.name} 디자인 보기`);
      button.setAttribute("aria-pressed", "false");
      return button;
    })
  );
  designSelect.replaceChildren(
    ...catalogApi.CUSTOM_TITLE_DESIGN_CATALOG.map((design) => {
      const option = document.createElement("option");
      option.value = design.id;
      option.textContent = design.name;
      return option;
    })
  );

  categoryGroup.addEventListener("click", (event) => {
    const button = event.target.closest("[data-custom-title-category]");
    if (button) filter(button.dataset.customTitleCategory);
  });
  designGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-custom-title-design]");
    if (!card) return;
    designSelect.value = catalogApi.normalizeCustomTitleDesignId(
      card.dataset.customTitleDesign
    );
    syncCustomTitleDesignCards(designGrid, designSelect.value);
    render();
    refreshDirty();
  });

  const picker = { filter, restore };
  picker.restore(designSelect.value);
  return picker;
}

export function restoreCustomTitleDesignEditor(picker, slide) {
  if (!picker || slide?.type !== "custom-title") return null;
  return picker.restore(slide.customTitleDesign);
}
