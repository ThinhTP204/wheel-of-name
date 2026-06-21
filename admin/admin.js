const STORAGE_KEY = "name-constellation:v2";
const ADMIN_CONTROL_KEY = "name-constellation:admin-control:v1";
const ADMIN_SESSION_KEY = "name-constellation:admin-unlocked";
const ADMIN_PASSWORD = "be9";

const elements = {
  lockView: document.querySelector("#lock-view"),
  controlView: document.querySelector("#control-view"),
  unlockForm: document.querySelector("#unlock-form"),
  passwordInput: document.querySelector("#password-input"),
  passwordError: document.querySelector("#password-error"),
  lockButton: document.querySelector("#lock-button"),
  missionTitle: document.querySelector("#mission-title"),
  missionMeta: document.querySelector("#mission-meta"),
  syncStatus: document.querySelector("#sync-status"),
  activeCommand: document.querySelector("#active-command"),
  activeCommandTitle: document.querySelector("#active-command-title"),
  activeCommandDetail: document.querySelector("#active-command-detail"),
  lastConsumed: document.querySelector("#last-consumed"),
  lastConsumedName: document.querySelector("#last-consumed-name"),
  lastConsumedTime: document.querySelector("#last-consumed-time"),
  draftState: document.querySelector("#draft-state"),
  modeOptions: [...document.querySelectorAll(".mode-option")],
  targetPicker: document.querySelector("#target-picker"),
  selectionSummary: document.querySelector("#selection-summary"),
  visibleCount: document.querySelector("#visible-count"),
  groupFilter: document.querySelector("#group-filter"),
  groupList: document.querySelector("#admin-group-list"),
  applyCommand: document.querySelector("#apply-command"),
  toast: document.querySelector("#admin-toast"),
};

const state = {
  topic: "",
  groups: [],
  control: randomControl(),
  draftMode: "random",
  draftTargetGroupId: null,
  filter: "",
  toastTimer: null,
};

function randomControl(extra = {}) {
  return {
    mode: "random",
    targetGroupId: null,
    updatedAt: Date.now(),
    ...extra,
  };
}

function searchKey(value) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d");
}

function readWheelState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    state.topic = typeof saved?.topic === "string" ? saved.topic : "";
    state.groups = Array.isArray(saved?.groups)
      ? saved.groups.filter(
          (group) =>
            group &&
            typeof group.id === "string" &&
            typeof group.name === "string",
        )
      : [];
  } catch {
    state.topic = "";
    state.groups = [];
  }
}

function readControl() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_CONTROL_KEY));
    if (!saved || !["random", "next", "locked"].includes(saved.mode)) {
      state.control = randomControl();
      return;
    }

    state.control = {
      ...saved,
      targetGroupId:
        typeof saved.targetGroupId === "string" ? saved.targetGroupId : null,
    };
  } catch {
    state.control = randomControl();
  }
}

function persistControl(control) {
  state.control = control;
  localStorage.setItem(ADMIN_CONTROL_KEY, JSON.stringify(control));
}

function formatTime(timestamp) {
  if (!timestamp) return "";

  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function selectedGroup(groupId = state.draftTargetGroupId) {
  return state.groups.find((group) => group.id === groupId) || null;
}

function controlCopy(control = state.control) {
  const target = selectedGroup(control.targetGroupId);

  if (control.mode === "next" && target) {
    return {
      title: `Lượt kế tiếp: ${target.name}`,
      detail: "Lệnh sẽ tự trở về Random ngay khi vòng bắt đầu quay.",
    };
  }

  if (control.mode === "locked" && target) {
    return {
      title: `Đang khóa: ${target.name}`,
      detail: "Mọi lượt tiếp theo sẽ hội tụ vào quỹ đạo này.",
    };
  }

  return {
    title: "Random công bằng",
    detail: "Mỗi quỹ đạo có cơ hội như nhau.",
  };
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3200);
}

function renderMission() {
  elements.missionTitle.textContent = state.topic || "Chưa có chủ đề";
  elements.missionMeta.textContent = `${state.groups.length} quỹ đạo được phát hiện`;
  elements.syncStatus.textContent = state.groups.length ? "LOCAL / LIVE" : "LOCAL / WAITING";

  const copy = controlCopy();
  elements.activeCommand.dataset.mode = state.control.mode;
  elements.activeCommandTitle.textContent = copy.title;
  elements.activeCommandDetail.textContent = copy.detail;

  const hasConsumed = Boolean(
    state.control.lastConsumedGroupName && state.control.lastConsumedAt,
  );
  elements.lastConsumed.hidden = !hasConsumed;
  if (hasConsumed) {
    elements.lastConsumedName.textContent = state.control.lastConsumedGroupName;
    elements.lastConsumedTime.textContent =
      `Đã dùng lúc ${formatTime(state.control.lastConsumedAt)}`;
  }
}

function renderModes() {
  elements.modeOptions.forEach((button) => {
    button.setAttribute(
      "aria-checked",
      String(button.dataset.mode === state.draftMode),
    );
  });
  elements.targetPicker.hidden = state.draftMode === "random";
}

function renderGroups() {
  const filter = searchKey(state.filter);
  const visibleGroups = state.groups.filter((group) =>
    filter ? searchKey(group.name).includes(filter) : true,
  );
  elements.groupList.replaceChildren();
  elements.visibleCount.textContent = `${visibleGroups.length} / ${state.groups.length}`;

  if (state.groups.length === 0) {
    const empty = document.createElement("div");
    empty.className = "admin-list-empty";
    empty.textContent = "Hãy mở màn hình quay và thêm nhóm trước.";
    elements.groupList.append(empty);
  } else if (visibleGroups.length === 0) {
    const empty = document.createElement("div");
    empty.className = "admin-list-empty";
    empty.textContent = "Không tìm thấy quỹ đạo phù hợp.";
    elements.groupList.append(empty);
  }

  visibleGroups.forEach((group) => {
    const index = state.groups.findIndex((item) => item.id === group.id);
    const button = document.createElement("button");
    const selected = group.id === state.draftTargetGroupId;
    button.className = "admin-group-option";
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(selected));
    button.dataset.groupId = group.id;
    button.style.setProperty("--group-index", index);

    const number = document.createElement("span");
    number.className = "admin-group-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const orbit = document.createElement("span");
    orbit.className = "admin-group-orbit";
    orbit.setAttribute("aria-hidden", "true");
    orbit.append(document.createElement("i"));

    const name = document.createElement("strong");
    name.textContent = group.name;

    const check = document.createElement("span");
    check.className = "admin-group-check";
    check.textContent = selected ? "ĐÃ CHỌN" : "CHỌN";

    button.append(number, orbit, name, check);
    button.addEventListener("click", () => {
      state.draftTargetGroupId = group.id;
      renderDraft();
    });
    elements.groupList.append(button);
  });
}

function renderDraft() {
  renderModes();
  renderGroups();
  const target = selectedGroup();
  elements.selectionSummary.textContent = target?.name || "Chưa chọn nhóm";

  const unchanged =
    state.draftMode === state.control.mode &&
    (state.draftMode === "random" ||
      state.draftTargetGroupId === state.control.targetGroupId);
  elements.draftState.textContent = unchanged ? "CHƯA THAY ĐỔI" : "CHỜ ÁP DỤNG";
  elements.draftState.classList.toggle("is-dirty", !unchanged);

  const needsTarget = state.draftMode !== "random";
  const disabled = needsTarget && !target;
  elements.applyCommand.disabled = disabled;
  const labels = {
    random: "Kích hoạt Random",
    next: target ? `Chọn ${target.name} ở lượt tới` : "Chọn một quỹ đạo",
    locked: target ? `Khóa vào ${target.name}` : "Chọn một quỹ đạo",
  };
  elements.applyCommand.querySelector("span").textContent = labels[state.draftMode];
}

function renderAll({ syncDraft = false } = {}) {
  if (
    state.control.mode !== "random" &&
    !state.groups.some((group) => group.id === state.control.targetGroupId)
  ) {
    persistControl(
      randomControl({
        resetReason: "target-missing",
      }),
    );
  }

  if (syncDraft) {
    state.draftMode = state.control.mode;
    state.draftTargetGroupId = state.control.targetGroupId;
  } else if (
    state.draftTargetGroupId &&
    !state.groups.some((group) => group.id === state.draftTargetGroupId)
  ) {
    state.draftTargetGroupId = null;
  }

  renderMission();
  renderDraft();
}

function applyCommand() {
  const target = selectedGroup();
  if (state.draftMode !== "random" && !target) {
    showToast("Hãy chọn một quỹ đạo trước.");
    return;
  }

  const control = {
    mode: state.draftMode,
    targetGroupId: state.draftMode === "random" ? null : target.id,
    targetGroupName: state.draftMode === "random" ? null : target.name,
    updatedAt: Date.now(),
  };
  persistControl(control);
  renderAll({ syncDraft: true });

  if (control.mode === "random") showToast("Đã trả trường về Random.");
  if (control.mode === "next") showToast(`Đã cài ${target.name} cho lượt kế tiếp.`);
  if (control.mode === "locked") showToast(`Đã khóa nhiều lượt vào ${target.name}.`);
}

function showControlRoom() {
  elements.lockView.hidden = true;
  elements.controlView.hidden = false;
  readWheelState();
  readControl();
  renderAll({ syncDraft: true });
}

function showLockScreen() {
  elements.controlView.hidden = true;
  elements.lockView.hidden = false;
  elements.passwordInput.value = "";
  elements.passwordError.textContent = "";
  requestAnimationFrame(() => elements.passwordInput.focus());
}

elements.unlockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (elements.passwordInput.value !== ADMIN_PASSWORD) {
    elements.passwordError.textContent = "Sai mật khẩu điều khiển.";
    elements.unlockForm.classList.remove("is-denied");
    requestAnimationFrame(() => elements.unlockForm.classList.add("is-denied"));
    elements.passwordInput.select();
    return;
  }

  sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
  showControlRoom();
});

elements.passwordInput.addEventListener("input", () => {
  elements.passwordError.textContent = "";
  elements.unlockForm.classList.remove("is-denied");
});

elements.lockButton.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  showLockScreen();
});

elements.modeOptions.forEach((button) => {
  button.addEventListener("click", () => {
    state.draftMode = button.dataset.mode;
    if (
      state.draftMode !== "random" &&
      !state.draftTargetGroupId &&
      state.groups.length
    ) {
      state.draftTargetGroupId = state.groups[0].id;
    }
    renderDraft();
  });
});

elements.groupFilter.addEventListener("input", () => {
  state.filter = elements.groupFilter.value;
  renderGroups();
});

elements.applyCommand.addEventListener("click", applyCommand);
document.addEventListener("keydown", (event) => {
  if (
    elements.controlView.hidden ||
    event.key !== "Enter" ||
    (!event.metaKey && !event.ctrlKey)
  ) {
    return;
  }

  event.preventDefault();
  applyCommand();
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    readWheelState();
    renderAll();
  }

  if (event.key === ADMIN_CONTROL_KEY) {
    readControl();
    renderAll({ syncDraft: true });
  }
});

if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "true") {
  showControlRoom();
} else {
  showLockScreen();
}
