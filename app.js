const STORAGE_KEY = "name-constellation:v2";
const LEGACY_STORAGE_KEY = "wheel-of-names:v1";
const SESSION_KEY = "name-constellation:active";
const MAX_GROUPS = 24;
const TAU = Math.PI * 2;

const DEFAULT_GROUPS = [
  "Nhóm Mặt Trời",
  "Nhóm Biển Xanh",
  "Nhóm Cầu Vồng",
  "Nhóm Sao Băng",
  "Nhóm Lá Xanh",
  "Nhóm Năng Lượng",
  "Nhóm Sáng Tạo",
  "Nhóm Kết Nối",
];

const FIELD_COLORS = [
  "oklch(0.85 0.19 113)",
  "oklch(0.59 0.23 255)",
  "oklch(0.66 0.22 28)",
  "oklch(0.57 0.23 304)",
  "oklch(0.87 0.17 92)",
];

const INK = "oklch(0.16 0.035 285)";
const PAPER = "oklch(0.995 0.004 285)";
const MUTED_LINE = "oklch(0.16 0.035 285 / 0.16)";
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const FIELD_DOTS = Array.from({ length: 72 }, (_, index) => ({
  x: ((Math.sin(index * 91.73) + 1) / 2) * 0.94 + 0.03,
  y: ((Math.cos(index * 47.21) + 1) / 2) * 0.9 + 0.05,
  size: 0.7 + ((index * 13) % 5) * 0.32,
  phase: (index * 0.73) % TAU,
}));

const elements = {
  setupView: document.querySelector("#setup-view"),
  wheelView: document.querySelector("#wheel-view"),
  topicForm: document.querySelector("#topic-form"),
  topicInput: document.querySelector("#topic-input"),
  topicError: document.querySelector("#topic-error"),
  topicHeading: document.querySelector("#topic-heading"),
  editTopicButton: document.querySelector("#edit-topic-button"),
  wheelShell: document.querySelector("#wheel-shell"),
  wheelCanvas: document.querySelector("#wheel-canvas"),
  wheelStatus: document.querySelector("#wheel-status"),
  fieldIndex: document.querySelector("#field-index"),
  fieldTime: document.querySelector("#field-time"),
  spinButton: document.querySelector("#spin-button"),
  groupList: document.querySelector("#group-list"),
  groupCount: document.querySelector("#group-count"),
  addGroupForm: document.querySelector("#add-group-form"),
  newGroupInput: document.querySelector("#new-group-input"),
  groupError: document.querySelector("#group-error"),
  groupItemTemplate: document.querySelector("#group-item-template"),
  resultDialog: document.querySelector("#result-dialog"),
  resultTitle: document.querySelector("#result-title"),
  keepButton: document.querySelector("#keep-button"),
  removeWinnerButton: document.querySelector("#remove-winner-button"),
  dialogCloseButton: document.querySelector("#dialog-close-button"),
  soundButton: document.querySelector("#sound-button"),
  fullscreenButton: document.querySelector("#fullscreen-button"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toast-message"),
  undoButton: document.querySelector("#undo-button"),
  signalLayer: document.querySelector("#confetti-layer"),
  liveRegion: document.querySelector("#live-region"),
};

const state = {
  topic: "",
  groups: [],
  isSpinning: false,
  selectedGroupId: null,
  selectedIndex: -1,
  soundEnabled: false,
  lastRemoval: null,
  toastTimer: null,
  spinStart: 0,
  spinDuration: 4200,
  revealGroupId: null,
  canvasWidth: 0,
  canvasHeight: 0,
  pixelRatio: 1,
  pointerX: 0,
  pointerY: 0,
  pointerTargetX: 0,
  pointerTargetY: 0,
};

let audioContext = null;
let lastClockSecond = -1;

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `group-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDefaultGroups() {
  return DEFAULT_GROUPS.map((name) => ({ id: createId(), name }));
}

function loadState() {
  try {
    const saved =
      JSON.parse(localStorage.getItem(STORAGE_KEY)) ||
      JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));

    if (saved && typeof saved === "object") {
      state.topic = typeof saved.topic === "string" ? saved.topic : "";
      state.groups = Array.isArray(saved.groups)
        ? saved.groups
            .filter((group) => group && typeof group.name === "string")
            .map((group) => ({
              id: typeof group.id === "string" ? group.id : createId(),
              name: group.name.trim().slice(0, 60),
            }))
        : createDefaultGroups();
      state.soundEnabled = saved.soundEnabled === true;
      persistState();
      return;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  state.groups = createDefaultGroups();
}

function persistState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      topic: state.topic,
      groups: state.groups,
      soundEnabled: state.soundEnabled,
    }),
  );
}

function prefersReducedMotion() {
  return reducedMotionQuery.matches;
}

function showView(viewName) {
  const showField = viewName === "field";
  elements.setupView.hidden = showField;
  elements.wheelView.hidden = !showField;

  if (showField) {
    elements.topicHeading.textContent = state.topic;
    sessionStorage.setItem(SESSION_KEY, "true");
    requestAnimationFrame(() => {
      resizeField();
      elements.spinButton.focus();
    });
  } else {
    sessionStorage.removeItem(SESSION_KEY);
    elements.topicInput.value = state.topic;
    requestAnimationFrame(() => elements.topicInput.focus());
  }
}

function transitionToView(viewName) {
  if (document.startViewTransition && !prefersReducedMotion()) {
    document.startViewTransition(() => showView(viewName));
    return;
  }

  showView(viewName);
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function hasDuplicateName(name, excludedId = null) {
  const normalized = name.toLocaleLowerCase("vi");
  return state.groups.some(
    (group) =>
      group.id !== excludedId && group.name.toLocaleLowerCase("vi") === normalized,
  );
}

function colorForIndex(index) {
  return FIELD_COLORS[index % FIELD_COLORS.length];
}

function renderGroups() {
  elements.groupList.replaceChildren();

  if (state.groups.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "group-list-empty";
    emptyState.textContent =
      "Trường đang trống. Thêm cái tên đầu tiên để tạo một quỹ đạo.";
    elements.groupList.append(emptyState);
  }

  state.groups.forEach((group, index) => {
    const item = elements.groupItemTemplate.content.firstElementChild.cloneNode(true);
    const number = item.querySelector(".group-number");
    const label = item.querySelector("label");
    const input = item.querySelector(".group-name-input");
    const deleteButton = item.querySelector(".delete-group-button");
    const inputId = `group-${group.id}`;

    item.dataset.groupId = group.id;
    item.style.setProperty("--group-color", colorForIndex(index));
    number.textContent = String(index + 1).padStart(2, "0");
    label.htmlFor = inputId;
    label.textContent = `Tên nhóm ${index + 1}`;
    input.id = inputId;
    input.value = group.name;
    input.dataset.originalValue = group.name;
    deleteButton.setAttribute("aria-label", `Xóa ${group.name}`);

    input.addEventListener("focus", () => {
      input.dataset.originalValue = group.name;
      input.select();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }

      if (event.key === "Escape") {
        input.value = input.dataset.originalValue;
        input.blur();
      }
    });

    input.addEventListener("blur", () => {
      const nextName = normalizeName(input.value);
      const previousName = input.dataset.originalValue;

      if (!nextName) {
        input.value = previousName;
        showToast("Tên nhóm không được để trống.");
        return;
      }

      if (hasDuplicateName(nextName, group.id)) {
        input.value = previousName;
        showToast("Tên nhóm này đã có trong trường.");
        return;
      }

      group.name = nextName;
      input.value = nextName;
      input.dataset.originalValue = nextName;
      deleteButton.setAttribute("aria-label", `Xóa ${nextName}`);
      persistState();
      announce(`Đã đổi tên nhóm thành ${nextName}.`);
    });

    deleteButton.addEventListener("click", () => removeGroup(group.id));
    elements.groupList.append(item);
  });

  const count = state.groups.length;
  elements.groupCount.textContent = String(count).padStart(2, "0");
  elements.fieldIndex.textContent = `FIELD / ${String(count).padStart(2, "0")}`;
  elements.spinButton.disabled = count < 2 || state.isSpinning;
  elements.wheelStatus.textContent =
    count < 2
      ? "Cần ít nhất 2 quỹ đạo để chọn."
      : "Nhấn nút hoặc phím Space để kích hoạt.";
}

function addGroup(name) {
  const normalized = normalizeName(name);

  if (state.groups.length >= MAX_GROUPS) {
    elements.groupError.textContent = `Trường hỗ trợ tối đa ${MAX_GROUPS} nhóm.`;
    return;
  }

  if (!normalized) {
    elements.groupError.textContent = "Hãy nhập tên nhóm.";
    elements.newGroupInput.focus();
    return;
  }

  if (hasDuplicateName(normalized)) {
    elements.groupError.textContent = "Tên nhóm này đã có trong trường.";
    elements.newGroupInput.select();
    return;
  }

  state.groups.push({ id: createId(), name: normalized });
  elements.groupError.textContent = "";
  elements.newGroupInput.value = "";
  persistState();
  renderGroups();
  announce(`Đã tạo quỹ đạo cho ${normalized}.`);

  requestAnimationFrame(() => {
    elements.groupList.scrollTop = elements.groupList.scrollHeight;
    elements.newGroupInput.focus();
  });
}

function removeGroup(groupId) {
  if (state.isSpinning) return;

  const index = state.groups.findIndex((group) => group.id === groupId);
  if (index === -1) return;

  const [removedGroup] = state.groups.splice(index, 1);
  state.lastRemoval = { group: removedGroup, index };
  persistState();
  renderGroups();
  showToast(`Đã đưa ${removedGroup.name} ra khỏi trường.`, true);
  announce(`Đã xóa ${removedGroup.name}. Bạn có thể hoàn tác.`);
}

function undoRemoval() {
  if (!state.lastRemoval) return;

  const { group, index } = state.lastRemoval;
  state.groups.splice(Math.min(index, state.groups.length), 0, group);
  state.lastRemoval = null;
  persistState();
  renderGroups();
  hideToast();
  announce(`Đã đưa ${group.name} trở lại trường.`);
}

function showToast(message, showUndo = false) {
  window.clearTimeout(state.toastTimer);
  elements.toastMessage.textContent = message;
  elements.undoButton.hidden = !showUndo;
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(hideToast, showUndo ? 7000 : 3500);
}

function hideToast() {
  elements.toast.hidden = true;
  window.clearTimeout(state.toastTimer);
}

function announce(message) {
  elements.liveRegion.textContent = "";
  requestAnimationFrame(() => {
    elements.liveRegion.textContent = message;
  });
}

function resizeField(entries) {
  if (elements.wheelView.hidden) return;

  const rect = entries?.[0]?.contentRect ?? elements.wheelShell.getBoundingClientRect();
  const nextWidth = Math.max(280, Math.round(rect.width));
  const nextHeight = Math.max(360, Math.round(rect.height));
  const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  if (
    nextWidth === state.canvasWidth &&
    nextHeight === state.canvasHeight &&
    nextPixelRatio === state.pixelRatio
  ) {
    return;
  }

  state.canvasWidth = nextWidth;
  state.canvasHeight = nextHeight;
  state.pixelRatio = nextPixelRatio;
  elements.wheelCanvas.width = Math.round(state.canvasWidth * state.pixelRatio);
  elements.wheelCanvas.height = Math.round(state.canvasHeight * state.pixelRatio);
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function easeInOutQuint(value) {
  return value < 0.5
    ? 16 * value ** 5
    : 1 - (-2 * value + 2) ** 5 / 2;
}

function easeOutExpo(value) {
  return value === 1 ? 1 : 1 - 2 ** (-10 * value);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function groupRingData(index, total) {
  const ring = index % 3;
  const position = Math.floor(index / 3);
  const ringCount = Math.ceil((total - ring) / 3);
  return { ring, position, ringCount: Math.max(1, ringCount) };
}

function getNodePositions(timestamp) {
  const width = state.canvasWidth;
  const height = state.canvasHeight;
  const centerX = width / 2 + state.pointerX * 14;
  const centerY = height / 2 + state.pointerY * 10;
  const minimum = Math.min(width, height);
  const spinProgress = state.isSpinning
    ? clamp((timestamp - state.spinStart) / state.spinDuration)
    : 0;
  const accelerated = easeInOutQuint(spinProgress);
  const reveal = clamp((spinProgress - 0.72) / 0.28);
  const radii = [
    { x: Math.min(width * 0.23, minimum * 0.35), y: minimum * 0.19 },
    { x: Math.min(width * 0.34, minimum * 0.53), y: minimum * 0.3 },
    { x: Math.min(width * 0.43, minimum * 0.69), y: minimum * 0.41 },
  ];

  return state.groups.map((group, index) => {
    const { ring, position, ringCount } = groupRingData(index, state.groups.length);
    const direction = ring % 2 === 0 ? 1 : -1;
    const baseAngle = (position / ringCount) * TAU + ring * 0.87;
    const idleMotion = prefersReducedMotion()
      ? 0
      : timestamp * (0.000035 + ring * 0.000012) * direction;
    const spinMotion = accelerated * TAU * (3.8 + ring * 1.25) * direction;
    const contraction = 1 - Math.sin(spinProgress * Math.PI) * 0.42;
    const radius = radii[ring];
    const angle = baseAngle + idleMotion + spinMotion;
    let x = centerX + Math.cos(angle) * radius.x * contraction;
    let y = centerY + Math.sin(angle) * radius.y * contraction;
    let alpha = 1;
    let scale = 1;
    const selected = group.id === state.selectedGroupId;

    if (state.isSpinning && reveal > 0) {
      if (selected) {
        const lock = easeOutExpo(reveal);
        x = lerp(x, centerX, lock);
        y = lerp(y, centerY, lock);
        scale = 1 + lock * 0.58;
      } else {
        alpha = 1 - reveal * 0.86;
        scale = 1 - reveal * 0.34;
      }
    }

    if (!state.isSpinning && state.revealGroupId) {
      if (group.id === state.revealGroupId) {
        x = centerX;
        y = centerY;
        scale = 1.58;
      } else {
        alpha = 0.13;
        scale = 0.72;
      }
    }

    return {
      group,
      index,
      ring,
      x,
      y,
      alpha,
      scale,
      locked:
        (!state.isSpinning && group.id === state.revealGroupId) ||
        (state.isSpinning && selected && reveal > 0.08),
    };
  });
}

function drawOrbit(context, centerX, centerY, radiusX, radiusY, rotation, alpha) {
  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  context.beginPath();
  context.ellipse(0, 0, radiusX, radiusY, 0, 0, TAU);
  context.strokeStyle = `oklch(0.16 0.035 285 / ${alpha})`;
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}

function drawFieldBackground(context, timestamp) {
  const width = state.canvasWidth;
  const height = state.canvasHeight;
  const centerX = width / 2 + state.pointerX * 14;
  const centerY = height / 2 + state.pointerY * 10;
  const minimum = Math.min(width, height);

  context.clearRect(0, 0, width, height);

  FIELD_DOTS.forEach((dot) => {
    const pulse = prefersReducedMotion()
      ? 0.65
      : 0.35 + (Math.sin(timestamp * 0.0012 + dot.phase) + 1) * 0.2;
    context.beginPath();
    context.arc(dot.x * width, dot.y * height, dot.size, 0, TAU);
    context.fillStyle = `oklch(0.16 0.035 285 / ${pulse})`;
    context.fill();
  });

  drawOrbit(
    context,
    centerX,
    centerY,
    Math.min(width * 0.23, minimum * 0.35),
    minimum * 0.19,
    -0.14,
    0.24,
  );
  drawOrbit(
    context,
    centerX,
    centerY,
    Math.min(width * 0.34, minimum * 0.53),
    minimum * 0.3,
    0.22,
    0.18,
  );
  drawOrbit(
    context,
    centerX,
    centerY,
    Math.min(width * 0.43, minimum * 0.69),
    minimum * 0.41,
    -0.08,
    0.13,
  );

  const pulse = prefersReducedMotion() ? 1 : 1 + Math.sin(timestamp * 0.002) * 0.12;
  context.beginPath();
  context.arc(centerX, centerY, 8 * pulse, 0, TAU);
  context.fillStyle = INK;
  context.fill();

  context.beginPath();
  context.arc(centerX, centerY, 22 * pulse, 0, TAU);
  context.strokeStyle = "oklch(0.16 0.035 285 / 0.24)";
  context.stroke();
}

function drawConnections(context, nodes) {
  [0, 1, 2].forEach((ring) => {
    const ringNodes = nodes.filter((node) => node.ring === ring);
    if (ringNodes.length < 2) return;

    context.beginPath();
    ringNodes.forEach((node, index) => {
      if (index === 0) context.moveTo(node.x, node.y);
      else context.lineTo(node.x, node.y);
    });
    context.closePath();
    context.strokeStyle = MUTED_LINE;
    context.lineWidth = 1;
    context.setLineDash([3, 8]);
    context.stroke();
    context.setLineDash([]);
  });
}

function drawNode(context, node) {
  const { group, index, x, y, alpha, scale, locked } = node;
  const selected = locked;
  const compact = state.groups.length > 15;
  const fontSize = selected ? 16 * scale : (compact ? 11 : 13) * scale;
  const nodeRadius = selected ? 10 * scale : (compact ? 7 : 9) * scale;

  context.save();
  context.globalAlpha = alpha;
  context.translate(x, y);
  context.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
  const label = group.name.length > 24 ? `${group.name.slice(0, 22)}…` : group.name;
  const textWidth = context.measureText(label).width;
  const labelHeight = selected ? 44 * scale : (compact ? 29 : 34) * scale;
  const labelWidth = Math.min(
    textWidth + (selected ? 48 : 28) * scale,
    selected ? state.canvasWidth * 0.72 : 210 * scale,
  );
  const placeLeft = !selected && x > state.canvasWidth * 0.62;
  const labelX = selected
    ? -labelWidth / 2
    : placeLeft
      ? -nodeRadius - 7 * scale - labelWidth
      : nodeRadius + 7 * scale;
  const labelY = -labelHeight / 2;

  if (selected) {
    context.beginPath();
    context.arc(0, 0, nodeRadius * 3.8, 0, TAU);
    context.fillStyle = `oklch(0.85 0.19 113 / ${state.isSpinning ? 0.22 : 0.34})`;
    context.fill();
  }

  roundedRect(context, labelX, labelY, labelWidth, labelHeight, labelHeight / 2);
  context.fillStyle = selected ? INK : PAPER;
  context.fill();
  context.strokeStyle = INK;
  context.lineWidth = Math.max(1, 1.2 * scale);
  context.stroke();

  const markerX = selected
    ? labelX + 20 * scale
    : placeLeft
      ? -nodeRadius
      : nodeRadius;
  context.beginPath();
  context.arc(markerX, 0, nodeRadius, 0, TAU);
  context.fillStyle = colorForIndex(index);
  context.fill();
  context.strokeStyle = INK;
  context.lineWidth = Math.max(1, 1.4 * scale);
  context.stroke();

  context.fillStyle = selected ? PAPER : INK;
  context.textAlign = selected ? "left" : "center";
  context.textBaseline = "middle";
  context.fillText(
    label,
    selected ? labelX + 39 * scale : labelX + labelWidth / 2,
    0,
    selected ? labelWidth - 52 * scale : labelWidth - 18 * scale,
  );
  context.restore();
}

function drawEmptyField(context) {
  context.save();
  context.fillStyle = INK;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "800 18px Inter, system-ui, sans-serif";
  context.fillText(
    "Thêm tên để đánh thức trường chuyển động.",
    state.canvasWidth / 2,
    state.canvasHeight / 2 + 52,
  );
  context.restore();
}

function renderField(timestamp) {
  if (!elements.wheelView.hidden && state.canvasWidth && state.canvasHeight) {
    const context = elements.wheelCanvas.getContext("2d");
    context.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);

    state.pointerX = lerp(state.pointerX, state.pointerTargetX, 0.055);
    state.pointerY = lerp(state.pointerY, state.pointerTargetY, 0.055);

    drawFieldBackground(context, timestamp);
    if (state.groups.length === 0) {
      drawEmptyField(context);
    } else {
      const nodes = getNodePositions(timestamp);
      drawConnections(context, nodes);
      [...nodes]
        .sort((first, second) => first.alpha - second.alpha)
        .forEach((node) => drawNode(context, node));
    }
  }

  const second = Math.floor(timestamp / 1000);
  if (second !== lastClockSecond) {
    lastClockSecond = second;
    elements.fieldTime.textContent = new Date().toLocaleTimeString("vi-VN", {
      hour12: false,
    });
  }

  requestAnimationFrame(renderField);
}

function randomIndex(length) {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return Math.floor((values[0] / 4294967296) * length);
  }

  return Math.floor(Math.random() * length);
}

function spinField() {
  if (state.isSpinning || state.groups.length < 2 || elements.resultDialog.open) {
    return;
  }

  hideToast();
  state.selectedIndex = randomIndex(state.groups.length);
  state.selectedGroupId = state.groups[state.selectedIndex].id;
  state.revealGroupId = null;
  state.isSpinning = true;
  state.spinStart = performance.now();
  state.spinDuration = prefersReducedMotion() ? 180 : 4200;

  document.body.classList.add("is-spinning");
  elements.spinButton.disabled = true;
  setEditingDisabled(true);
  elements.wheelStatus.textContent = "Các quỹ đạo đang hội tụ...";
  announce("Trường đang chuyển động để chọn một nhóm.");
  playSpinSound();

  window.setTimeout(
    () => finishSpin(state.groups[state.selectedIndex]),
    state.spinDuration + 80,
  );
}

function finishSpin(group) {
  if (!group) return;

  state.isSpinning = false;
  state.revealGroupId = group.id;
  document.body.classList.remove("is-spinning");
  elements.resultTitle.textContent = group.name;
  elements.wheelStatus.textContent = `Tín hiệu đã khóa: ${group.name}`;
  playWinSound();
  burstSignals();

  window.setTimeout(
    () => {
      elements.resultDialog.showModal();
      elements.keepButton.focus();
      announce(`Kết quả là ${group.name}.`);
    },
    prefersReducedMotion() ? 0 : 280,
  );
}

function keepWinner() {
  const group = state.groups.find((item) => item.id === state.selectedGroupId);
  elements.resultDialog.close();
  state.selectedGroupId = null;
  state.selectedIndex = -1;
  state.revealGroupId = null;
  setEditingDisabled(false);
  elements.spinButton.disabled = state.groups.length < 2;
  elements.wheelStatus.textContent = group
    ? `${group.name} vẫn ở trong trường. Sẵn sàng chọn tiếp.`
    : "Sẵn sàng chọn tiếp.";
  elements.spinButton.focus();
}

function removeWinner() {
  const selectedId = state.selectedGroupId;
  elements.resultDialog.close();
  state.selectedGroupId = null;
  state.selectedIndex = -1;
  state.revealGroupId = null;
  setEditingDisabled(false);
  removeGroup(selectedId);
  elements.spinButton.focus();
}

function burstSignals() {
  if (prefersReducedMotion()) return;

  elements.signalLayer.replaceChildren();

  for (let index = 0; index < 34; index += 1) {
    const piece = document.createElement("span");
    const angle = (TAU * index) / 34 + Math.random() * 0.2;
    const distance = 150 + Math.random() * 300;
    piece.className = "signal-piece";
    piece.style.setProperty("--signal-color", colorForIndex(index));
    piece.style.setProperty("--signal-x", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--signal-y", `${Math.sin(angle) * distance}px`);
    piece.style.setProperty("--signal-size", `${5 + Math.random() * 12}px`);
    piece.style.setProperty(
      "--signal-radius",
      index % 3 === 0 ? "2px" : "50%",
    );
    piece.style.setProperty("--signal-rotation", `${Math.random() * 540}deg`);
    piece.style.animationDelay = `${Math.random() * 100}ms`;
    elements.signalLayer.append(piece);
  }

  window.setTimeout(() => elements.signalLayer.replaceChildren(), 1200);
}

function ensureAudioContext() {
  if (!state.soundEnabled) return null;

  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioContext = new AudioContext();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playTone(frequency, startTime, duration, volume = 0.03, type = "sine") {
  const context = ensureAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

function playSpinSound() {
  const context = ensureAudioContext();
  if (!context) return;
  const now = context.currentTime;
  playTone(146.83, now, 0.22, 0.02, "triangle");
  playTone(220, now + 0.1, 0.28, 0.018, "sine");
}

function playWinSound() {
  const context = ensureAudioContext();
  if (!context) return;
  const now = context.currentTime;
  playTone(392, now, 0.34, 0.028, "triangle");
  playTone(523.25, now + 0.08, 0.38, 0.03, "sine");
  playTone(783.99, now + 0.2, 0.5, 0.026, "sine");
}

function updateSoundButton() {
  elements.soundButton.setAttribute("aria-pressed", String(state.soundEnabled));
  elements.soundButton.setAttribute(
    "aria-label",
    state.soundEnabled ? "Tắt âm thanh" : "Bật âm thanh",
  );
}

function setEditingDisabled(disabled) {
  elements.editTopicButton.disabled = disabled;
  elements.newGroupInput.disabled = disabled;
  elements.addGroupForm.querySelector("button").disabled = disabled;
  elements.groupList.querySelectorAll("input, button").forEach((control) => {
    control.disabled = disabled;
  });
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  persistState();
  updateSoundButton();

  if (state.soundEnabled) {
    const context = ensureAudioContext();
    if (context) playTone(440, context.currentTime, 0.16, 0.024);
  }
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    showToast("Trình duyệt chưa cho phép chế độ toàn màn hình.");
  }
}

function updateFullscreenButton() {
  const isFullscreen = Boolean(document.fullscreenElement);
  elements.fullscreenButton.setAttribute(
    "aria-label",
    isFullscreen ? "Thoát toàn màn hình" : "Mở toàn màn hình",
  );
}

elements.topicForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const topic = normalizeName(elements.topicInput.value);

  if (!topic) {
    elements.topicError.textContent = "Hãy nhập tên chủ đề trước khi bắt đầu.";
    elements.topicInput.focus();
    return;
  }

  state.topic = topic;
  elements.topicError.textContent = "";
  persistState();
  transitionToView("field");
  renderGroups();
});

elements.editTopicButton.addEventListener("click", () => {
  if (!state.isSpinning) transitionToView("setup");
});

elements.addGroupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addGroup(elements.newGroupInput.value);
});

elements.newGroupInput.addEventListener("input", () => {
  elements.groupError.textContent = "";
});

elements.spinButton.addEventListener("click", spinField);
elements.keepButton.addEventListener("click", keepWinner);
elements.removeWinnerButton.addEventListener("click", removeWinner);
elements.dialogCloseButton.addEventListener("click", keepWinner);
elements.undoButton.addEventListener("click", undoRemoval);
elements.soundButton.addEventListener("click", toggleSound);
elements.fullscreenButton.addEventListener("click", toggleFullscreen);

elements.wheelShell.addEventListener("pointermove", (event) => {
  const rect = elements.wheelShell.getBoundingClientRect();
  state.pointerTargetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
  state.pointerTargetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
});

elements.wheelShell.addEventListener("pointerleave", () => {
  state.pointerTargetX = 0;
  state.pointerTargetY = 0;
});

elements.resultDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  keepWinner();
});

document.addEventListener("fullscreenchange", updateFullscreenButton);

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement;

  if (
    event.code === "Space" &&
    !isTyping &&
    !elements.wheelView.hidden &&
    !elements.resultDialog.open
  ) {
    event.preventDefault();
    spinField();
  }
});

const fieldResizeObserver = new ResizeObserver(resizeField);
fieldResizeObserver.observe(elements.wheelShell);

loadState();
updateSoundButton();
renderGroups();
requestAnimationFrame(renderField);

const shouldResume =
  sessionStorage.getItem(SESSION_KEY) === "true" && Boolean(state.topic);
showView(shouldResume ? "field" : "setup");
