const Logic = {

  workspaces: [],
  workspaceListElement: null,
  workspaceItemsElement: null,
  draggingItem: null,
  nextSibling: null,

  async init() {
    // We need the workspaces for rendering, so wait for this one
    await Logic.fetchWorkspaces();
    await Logic.renderWorkspacesList();
    await Logic.renderWorkspacesEdit();
    await Logic.registerEventListeners();
    await Logic.fetchWorkspaceElements();
    await Logic.addDragListeners();
  },

  async registerEventListeners() {
    document.addEventListener("click", async e => {
      if (e.target.classList.contains("js-switch-workspace")) {
        const workspaceId = e.target.dataset.workspaceId;
        Logic.callBackground("switchToWorkspace", {
          workspaceId: workspaceId
        });

      } else if (e.target.classList.contains("js-new-workspace")) {
        await Logic.callBackground("createNewWorkspaceAndSwitch");

        // And re-render the list panel
        await Logic.fetchWorkspaces();
        await Logic.renderWorkspacesList();

        await Logic.fetchWorkspaceElements();
        await Logic.addDragListeners();

      } else if (e.target.classList.contains("js-clone-workspace")) {
        await Logic.callBackground("cloneWorkspaceAndSwitch");

        // And re-render the list panel
        await Logic.fetchWorkspaces();
        await Logic.renderWorkspacesList();

        await Logic.fetchWorkspaceElements();
        await Logic.addDragListeners();

      } else if (e.target.classList.contains("js-switch-panel")) {
        await Logic.renderWorkspacesEdit();
        await Logic.fetchWorkspaces();
        document.querySelectorAll(".container").forEach(el => el.classList.toggle("hide"));

        // And re-render the list panel
        await Logic.renderWorkspacesEdit();
        await Logic.fetchWorkspaces();
        await Logic.renderWorkspacesList();

        await Logic.fetchWorkspaceElements();
        await Logic.addDragListeners();

      } else if (e.target.classList.contains("js-delete-workspace")) {
        // Delete element
        const li = e.target.parentNode;
        if (li.parentNode.childNodes.length == 1) {
          // Can't delete the last workspace
          return;
        }

        const workspaceId = li.dataset.workspaceId;
        li.parentNode.removeChild(li);

        // Delete the workspace
        await Logic.callBackground("deleteWorkspace", {
          workspaceId: workspaceId
        });

        // And re-render the list panel
        await Logic.fetchWorkspaces();
        await Logic.renderWorkspacesList();

        await Logic.fetchWorkspaceElements();
        await Logic.addDragListeners();
      }
    });

    document.addEventListener("change", async e => {
      if (e.target.classList.contains("js-edit-workspace-input")) {
        // Re-disable the input
        const name = e.target.value;
        e.target.disabled = true;

        // Save new name
        const workspaceId = e.target.parentNode.dataset.workspaceId;
        await Logic.callBackground("renameWorkspace", {
          workspaceId: workspaceId,
          workspaceName: name
        });

        // And re-render the list panel
        await Logic.fetchWorkspaces();
        await Logic.renderWorkspacesList();

        await Logic.fetchWorkspaceElements();
        await Logic.addDragListeners();
      }
    });

    // This focus is needed to capture key presses without user interaction
    document.querySelector("#keyupTrap").focus();
    document.addEventListener("keyup", async e => {
      const key = e.key;
      var index = parseInt(key);

      if (key.length == 1 && !isNaN(index)) {
        if (index == 0) {
          index = 10;
        }

        const el = document.querySelector(`#workspace-list li:nth-child(${index})`);
        if (el) {
          Logic.callBackground("switchToWorkspace", {
            workspaceId: el.dataset.workspaceId
          });

          window.close();
        }
      }

    });
  },

  async fetchWorkspaces() {
    this.workspaces = await Logic.callBackground("getWorkspacesForCurrentWindow");
  },

  async renderWorkspacesList() {
    const fragment = document.createDocumentFragment();

    this.workspaces.forEach(workspace => {
      const li = document.createElement("li");
      li.classList.add("workspace-list-entry", "js-switch-workspace");
      if (workspace.active) {
        li.classList.add("active");
      }
      li.textContent = workspace.name;
      li.dataset.workspaceId = workspace.id;
      li.draggable = true;

      const span = document.createElement("span");
      span.classList.add("tabs-qty");
      span.textContent = workspace.tabCount;
      li.appendChild(span);

      fragment.appendChild(li);
    });

    const list = document.querySelector("#workspace-list");
    list.innerHTML = '';
    list.appendChild(fragment);
  },

  async renderWorkspacesEdit() {
    const fragment = document.createDocumentFragment();

    this.workspaces.forEach(workspace => {
      const li = document.createElement("li");
      li.classList.add("workspace-edit-entry");
      li.dataset.workspaceId = workspace.id;

      const input = document.createElement("input");
      input.classList.add("js-edit-workspace-input");
      input.type = "text";
      input.value = workspace.name;
      // input.disabled = true;
      li.appendChild(input);

      // const renameBtn = document.createElement("a");
      // renameBtn.classList.add("edit-button", "edit-button-rename", "js-edit-workspace");
      // renameBtn.href = "#";
      // li.appendChild(renameBtn);

      const deleteBtn = document.createElement("a");
      deleteBtn.classList.add("edit-button", "edit-button-delete", "js-delete-workspace");
      deleteBtn.href = "#";
      li.appendChild(deleteBtn);

      fragment.appendChild(li);
    });

    const list = document.querySelector("#workspace-edit");
    list.innerHTML = '';
    list.appendChild(fragment);
  },

  async callBackground(method, args) {
    const message = Object.assign({}, {method}, args);

    if (typeof browser != "undefined") {
      return await browser.runtime.sendMessage(message);
    } else {
      return BackgroundMock.sendMessage(message);
    }
  },

  async fetchWorkspaceElements() {
    Logic.workspaceListElement = document.querySelector("#workspace-list");
    Logic.workspaceItemsElement = Logic.workspaceListElement.querySelectorAll(".workspace-list-entry");

    // Add drag classes
    Logic.workspaceItemsElement.forEach(item => {
      item.addEventListener("dragstart", () => {
        // Adding dragging class to item after a delay
        setTimeout(() => item.classList.add("dragging"), 0);
      });
      item.addEventListener("dragend", async () => {
        let workspaceIds = [];
        Logic.workspaceListElement.querySelectorAll(".workspace-list-entry").forEach(item => workspaceIds.push(item.dataset.workspaceId));
        await Logic.callBackground("changeWorkspaceOrder", {
          orderedWorkspaceIds: workspaceIds
        });
        item.classList.remove("dragging");
      });
    });
  },

  initDragOverBehavior(e) {

    e.preventDefault();
    const draggingItem = document.querySelector(".dragging");

    // Get all items except currently dragging item.
    let siblings = [...Logic.workspaceListElement.querySelectorAll(".workspace-list-entry:not(.dragging)")];

    // Find the sibling where the dragging item is being placed.
    let nextSibling = siblings.find(sibling => {
      return e.clientY <= sibling.offsetTop + sibling.offsetHeight;
    });

    // Insert the dragging item before the found sibling
    Logic.workspaceListElement.insertBefore(draggingItem, nextSibling);
    Logic.draggingItem = draggingItem;
    Logic.nextSibling = nextSibling;
  },
  async addDragListeners() {
    Logic.workspaceListElement.addEventListener("dragover", Logic.initDragOverBehavior);
    Logic.workspaceListElement.addEventListener("dragenter", e => e.preventDefault());
  }
}

Logic.init();
