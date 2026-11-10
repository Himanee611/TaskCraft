/* =========================================
   1. STORAGE AND APPLICATION VARIABLES
========================================= */

const TASKS_KEY = "taskcraft_tasks";
const THEME_KEY = "taskcraft_theme";

const EXTENSION_SECONDS = 15 * 60;

let tasks = [];
let editingTaskId = null;

let timerInterval = null;
let toastTimeout = null;

let lastPausedTaskId = null;
let timeUpTaskId = null;


/* =========================================
   2. HTML ELEMENTS
========================================= */

const taskForm = document.getElementById("taskForm");
const taskList = document.getElementById("taskList");

const activeTimerContent =
    document.getElementById("activeTimerContent");

const fullscreenTimer =
    document.getElementById("fullscreenTimer");

const fullscreenTimerDisplay =
    document.getElementById("fullscreenTimerDisplay");

const timeUpModal =
    document.getElementById("timeUpModal");

const toast =
    document.getElementById("toast");


/* =========================================
   3. HELPER FUNCTIONS
========================================= */

function createId() {
    return Date.now().toString() +
        Math.random().toString(16).slice(2);
}


function getToday() {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function getDateFromTimestamp(timestamp) {
    const date = new Date(timestamp);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function formatTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));

    const hours = Math.floor(totalSeconds / 3600);

    const minutes = Math.floor(
        (totalSeconds % 3600) / 60
    );

    const seconds = totalSeconds % 60;

    return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(seconds).padStart(2, "0")
    ].join(":");
}


function formatDuration(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));

    const hours = Math.floor(totalSeconds / 3600);

    const minutes = Math.floor(
        (totalSeconds % 3600) / 60
    );

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
}


function formatDate(dateString) {
    if (!dateString) {
        return "Not set";
    }

    const date = new Date(`${dateString}T00:00:00`);

    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}


function showToast(message) {
    toast.textContent = message;

    toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}


function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return replacements[character];
    });
}


/* =========================================
   4. TASK DATA NORMALIZATION
========================================= */

// Convert older saved tasks into the new timer format.
// This keeps your existing saved tasks usable.

function normalizeTask(task) {
    const estimatedSeconds =
        Math.max(0, Number(task.estimatedSeconds) || 0);

    const trackedSeconds =
        Math.max(0, Number(task.trackedSeconds) || 0);

    const extensionSeconds =
        Math.max(0, Number(task.extensionSeconds) || 0);

    let remainingSeconds;

    if (Number.isFinite(Number(task.remainingSeconds))) {
        remainingSeconds = Math.max(
            0,
            Number(task.remainingSeconds)
        );
    } else {
        // Older version used elapsed time.
        // Convert it into remaining time.
        remainingSeconds = Math.max(
            0,
            estimatedSeconds + extensionSeconds - trackedSeconds
        );
    }

    return {
        ...task,

        id: String(task.id || createId()),

        title: String(task.title || "Untitled Task"),

        category: task.category || "Other",

        priority: task.priority || "Medium",

        date: task.date || getToday(),

        deadline: task.deadline || "",

        estimatedSeconds,

        trackedSeconds,

        extensionSeconds,

        remainingSeconds,

        sessions: Array.isArray(task.sessions)
            ? task.sessions.map(session => ({
                date: session.date || getToday(),
                seconds: Math.max(0, Number(session.seconds) || 0)
            }))
            : [],

        completed: Boolean(task.completed),

        completedAt: task.completedAt || null,

        createdAt: task.createdAt || new Date().toISOString(),

        timer: {
            isRunning: false,
            startedAt: null,
            lastTickAt: null
        }
    };
}


/* =========================================
   5. LOCAL STORAGE
========================================= */

function loadTasks() {
    try {
        const savedTasks = localStorage.getItem(TASKS_KEY);

        const parsedTasks = savedTasks
            ? JSON.parse(savedTasks)
            : [];

        tasks = Array.isArray(parsedTasks)
            ? parsedTasks.map(normalizeTask)
            : [];

    } catch (error) {
        console.error("Could not load saved tasks:", error);

        tasks = [];
    }

    // All timers remain paused after reopening the website.
    tasks.forEach(task => {
        task.timer.isRunning = false;
        task.timer.startedAt = null;
        task.timer.lastTickAt = null;
    });

    saveTasks();
}


function saveTasks() {
    try {
        localStorage.setItem(
            TASKS_KEY,
            JSON.stringify(tasks)
        );
    } catch (error) {
        console.error("Could not save tasks:", error);

        showToast("Could not save data. Check browser storage.");
    }
}


/* =========================================
   6. THEME SWITCHING
========================================= */

function applyTheme(theme) {
    if (theme === "light") {
        document.body.classList.add("light-mode");

        document.getElementById("themeToggle").textContent = "☾";

    } else {
        document.body.classList.remove("light-mode");

        document.getElementById("themeToggle").textContent = "☀";
    }

    localStorage.setItem(THEME_KEY, theme);
}


function loadTheme() {
    const savedTheme =
        localStorage.getItem(THEME_KEY) || "dark";

    applyTheme(savedTheme);
}


function toggleTheme() {
    const isLightMode =
        document.body.classList.contains("light-mode");

    applyTheme(isLightMode ? "dark" : "light");
}


/* =========================================
   7. TASK CREATION AND EDITING
========================================= */

function saveTask(event) {
    event.preventDefault();

    const title =
        document.getElementById("taskTitle").value.trim();

    const category =
        document.getElementById("taskCategory").value;

    const priority =
        document.getElementById("taskPriority").value;

    const date =
        document.getElementById("taskDate").value;

    const deadline =
        document.getElementById("taskDeadline").value;

    const hours =
        Number(document.getElementById("taskHours").value);

    const minutes =
        Number(document.getElementById("taskMinutes").value);


    if (!title) {
        showToast("Please enter a task name.");
        return;
    }

    if (!date) {
        showToast("Please select a task date.");
        return;
    }

    if (
        !Number.isInteger(hours) ||
        !Number.isInteger(minutes) ||
        hours < 0 ||
        minutes < 0 ||
        minutes > 59 ||
        hours > 100 ||
        hours * 60 + minutes <= 0
    ) {
        showToast("Enter a valid estimated duration.");
        return;
    }

    if (deadline && deadline < date) {
        showToast("Deadline cannot be earlier than the task date.");
        return;
    }


    const estimatedSeconds =
        hours * 3600 + minutes * 60;


    if (editingTaskId) {
        const task = tasks.find(item =>
            item.id === editingTaskId
        );

        if (!task) {
            return;
        }

        const difference =
            estimatedSeconds - task.estimatedSeconds;

        task.title = title;
        task.category = category;
        task.priority = priority;
        task.date = date;
        task.deadline = deadline;

        task.estimatedSeconds = estimatedSeconds;

        // Adjust remaining time when the estimate changes.
        task.remainingSeconds = Math.max(
            0,
            task.remainingSeconds + difference
        );

        showToast("Task updated successfully.");

    } else {

        const newTask = {
            id: createId(),

            title,
            category,
            priority,

            date,
            deadline,

            estimatedSeconds,

            trackedSeconds: 0,

            extensionSeconds: 0,

            remainingSeconds: estimatedSeconds,

            sessions: [],

            completed: false,
            completedAt: null,

            timer: {
                isRunning: false,
                startedAt: null,
                lastTickAt: null
            },

            createdAt: new Date().toISOString()
        };

        tasks.push(newTask);

        showToast("Task added successfully.");
    }


    saveTasks();

    resetTaskForm();

    renderAll();
}


function resetTaskForm() {
    taskForm.reset();

    document.getElementById("taskDate").value = getToday();

    document.getElementById("taskHours").value = 1;

    document.getElementById("taskMinutes").value = 0;

    editingTaskId = null;

    document.getElementById("taskFormTitle").textContent =
        "Create a New Task";

    document.getElementById("saveTaskBtn").textContent =
        "Add Task";

    document.getElementById("cancelEditBtn")
        .classList.add("hidden");
}


function editTask(taskId) {
    const task = tasks.find(item =>
        item.id === taskId
    );

    if (!task) {
        return;
    }

    if (task.timer.isRunning) {
        showToast("Pause the timer before editing this task.");
        return;
    }

    if (task.completed) {
        showToast("Reopen the task before editing it.");
        return;
    }

    editingTaskId = taskId;

    document.getElementById("taskTitle").value =
        task.title;

    document.getElementById("taskCategory").value =
        task.category;

    document.getElementById("taskPriority").value =
        task.priority;

    document.getElementById("taskDate").value =
        task.date;

    document.getElementById("taskDeadline").value =
        task.deadline || "";

    document.getElementById("taskHours").value =
        Math.floor(task.estimatedSeconds / 3600);

    document.getElementById("taskMinutes").value =
        Math.floor((task.estimatedSeconds % 3600) / 60);

    document.getElementById("taskFormTitle").textContent =
        "Edit Task";

    document.getElementById("saveTaskBtn").textContent =
        "Update Task";

    document.getElementById("cancelEditBtn")
        .classList.remove("hidden");

    document.getElementById("taskFormPanel")
        .scrollIntoView({ behavior: "smooth" });
}


/* =========================================
   8. TASK COMPLETION AND DELETION
========================================= */

function deleteTask(taskId) {
    const task = tasks.find(item =>
        item.id === taskId
    );

    if (!task) {
        return;
    }

    if (!confirm(`Delete "${task.title}"?`)) {
        return;
    }

    if (task.timer.isRunning) {
        pauseTimer();
    }

    if (timeUpTaskId === taskId) {
        closeTimeUpModal();
    }

    tasks = tasks.filter(item =>
        item.id !== taskId
    );

    if (lastPausedTaskId === taskId) {
        lastPausedTaskId = null;
    }

    saveTasks();

    renderAll();

    showToast("Task deleted.");
}


function completeTask(taskId) {
    const task = tasks.find(item =>
        item.id === taskId
    );

    if (!task) {
        return;
    }

    if (task.timer.isRunning) {
        pauseTimer();
    }

    task.completed = true;

    task.completedAt = new Date().toISOString();

    task.timer.isRunning = false;

    task.timer.startedAt = null;
    task.timer.lastTickAt = null;

    if (lastPausedTaskId === taskId) {
        lastPausedTaskId = null;
    }

    if (timeUpTaskId === taskId) {
        closeTimeUpModal();
    }

    saveTasks();

    renderAll();

    showToast("Task completed!");
}


function reopenTask(taskId) {
    const task = tasks.find(item =>
        item.id === taskId
    );

    if (!task) {
        return;
    }

    task.completed = false;
    task.completedAt = null;

    saveTasks();

    renderAll();

    showToast("Task moved back to pending.");
}


/* =========================================
   9. TASK DISPLAY
========================================= */

function renderTasks() {
    const filter =
        document.getElementById("statusFilter").value;

    const sortType =
        document.getElementById("sortTasks").value;

    let visibleTasks = [...tasks];


    if (filter === "Pending") {
        visibleTasks = visibleTasks.filter(task =>
            !task.completed
        );
    }

    if (filter === "Completed") {
        visibleTasks = visibleTasks.filter(task =>
            task.completed
        );
    }


    if (sortType === "date") {
        visibleTasks.sort((a, b) =>
            a.date.localeCompare(b.date)
        );
    }

    if (sortType === "newest") {
        visibleTasks.sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    }

    if (sortType === "priority") {
        const priorityOrder = {
            High: 1,
            Medium: 2,
            Low: 3
        };

        visibleTasks.sort((a, b) =>
            priorityOrder[a.priority] -
            priorityOrder[b.priority]
        );
    }


    if (visibleTasks.length === 0) {
        taskList.innerHTML = `
            <div class="empty-state">
                <h3>No tasks found</h3>
                <p>Try changing your filter or create a new task.</p>
            </div>
        `;

        return;
    }


    taskList.innerHTML = visibleTasks.map(task => {

        const status = task.completed
            ? "Completed"
            : "Pending";

        let actionButtons = "";


        if (task.completed) {

            actionButtons = `
                <button class="small-btn"
                    data-action="reopen"
                    data-id="${escapeHTML(task.id)}">
                    Reopen
                </button>
            `;

        } else {

            const isActive = task.timer.isRunning;

            actionButtons = `
                <button class="small-btn start"
                    data-action="start"
                    data-id="${escapeHTML(task.id)}">
                    ${isActive ? "Active" : "Start / Resume"}
                </button>

                <button class="small-btn"
                    data-action="complete"
                    data-id="${escapeHTML(task.id)}">
                    Complete
                </button>

                <button class="small-btn"
                    data-action="edit"
                    data-id="${escapeHTML(task.id)}">
                    Edit
                </button>
            `;
        }


        return `
            <article class="task-card ${task.completed ? "completed" : ""}">

                <div class="task-main">

                    <h3 class="task-title">
                        ${escapeHTML(task.title)}
                    </h3>

                    <div class="task-details">

                        <span>${escapeHTML(task.category)}</span>

                        <span class="priority ${escapeHTML(task.priority)}">
                            ${escapeHTML(task.priority)} Priority
                        </span>

                        <span>${formatDate(task.date)}</span>

                        <span>
                            Estimated:
                            ${formatDuration(task.estimatedSeconds)}
                        </span>

                        <span>
                            Remaining:
                            ${formatDuration(task.remainingSeconds)}
                        </span>

                        <span>
                            Tracked:
                            ${formatDuration(task.trackedSeconds)}
                        </span>

                        ${task.deadline ? `
                            <span>
                                Deadline: ${formatDate(task.deadline)}
                            </span>
                        ` : ""}

                        <span class="status-label">
                            ${status}
                        </span>

                    </div>
                </div>

                <div class="task-actions">

                    ${actionButtons}

                    <button class="small-btn danger"
                        data-action="delete"
                        data-id="${escapeHTML(task.id)}">
                        Delete
                    </button>

                </div>
            </article>
        `;

    }).join("");
}


// Handle task buttons.

taskList.addEventListener("click", event => {

    const button = event.target.closest("button[data-action]");

    if (!button) {
        return;
    }

    const taskId = button.dataset.id;
    const action = button.dataset.action;


    if (action === "start") {
        startTimer(taskId);
    }

    if (action === "complete") {
        completeTask(taskId);
    }

    if (action === "edit") {
        editTask(taskId);
    }

    if (action === "delete") {
        deleteTask(taskId);
    }

    if (action === "reopen") {
        reopenTask(taskId);
    }

});


/* =========================================
   10. TIMER SYSTEM
========================================= */

function getActiveTask() {
    return tasks.find(task =>
        task.timer.isRunning
    ) || null;
}


function getTaskElapsed(task) {
    return Number(task.trackedSeconds) || 0;
}


// Add actual working time to the task and its daily session.

function addTrackedSeconds(task, seconds) {
    if (seconds <= 0) {
        return;
    }

    task.trackedSeconds += seconds;

    const today = getToday();

    let session = task.sessions.find(item =>
        item.date === today
    );

    if (!session) {
        session = {
            date: today,
            seconds: 0
        };

        task.sessions.push(session);
    }

    session.seconds += seconds;
}


// Update remaining time and tracked time together.
// This is the central countdown calculation.

function updateRunningTask(task, now = Date.now()) {
    if (!task.timer.isRunning || !task.timer.lastTickAt) {
        return false;
    }

    const elapsedMilliseconds =
        Math.max(0, now - task.timer.lastTickAt);

    const elapsedSeconds =
        Math.floor(elapsedMilliseconds / 1000);

    if (elapsedSeconds <= 0) {
        return false;
    }

    const secondsToTrack = Math.min(
        elapsedSeconds,
        task.remainingSeconds
    );

    addTrackedSeconds(task, secondsToTrack);

    task.remainingSeconds = Math.max(
        0,
        task.remainingSeconds - secondsToTrack
    );

    task.timer.lastTickAt += elapsedSeconds * 1000;

    return task.remainingSeconds === 0;
}


// Start or resume a task timer.

function startTimer(taskId) {
    const task = tasks.find(item =>
        item.id === taskId
    );

    if (!task) {
        return;
    }

    if (task.completed) {
        showToast("Reopen this task before starting its timer.");
        return;
    }

    const anotherActiveTask = getActiveTask();

    if (anotherActiveTask && anotherActiveTask.id !== taskId) {
        showToast("Pause the current task before starting another.");
        return;
    }

    if (task.timer.isRunning) {
        return;
    }

    if (task.remainingSeconds <= 0) {
        showTimeUpModal(task.id);
        return;
    }

    closeTimeUpModal();

    task.timer.isRunning = true;

    task.timer.startedAt = Date.now();
    task.timer.lastTickAt = Date.now();

    lastPausedTaskId = task.id;

    saveTasks();

    startTimerUpdates();

    renderAll();

    showToast("Timer started.");
}


// Pause the currently running timer.

function pauseTimer() {
    const task = getActiveTask();

    if (!task) {
        return;
    }

    updateRunningTask(task);

    task.timer.isRunning = false;

    task.timer.startedAt = null;
    task.timer.lastTickAt = null;

    lastPausedTaskId = task.id;

    clearInterval(timerInterval);
    timerInterval = null;

    saveTasks();

    renderAll();
}


// Stop the timer when remaining time reaches zero.

function handleTimerFinished(task) {
    task.remainingSeconds = 0;

    task.timer.isRunning = false;

    task.timer.startedAt = null;
    task.timer.lastTickAt = null;

    lastPausedTaskId = task.id;

    clearInterval(timerInterval);
    timerInterval = null;

    saveTasks();

    renderAll();

    showTimeUpModal(task.id);
}


// Resume a paused task.

function resumeTimer(taskId) {
    startTimer(taskId);
}


// Finish the active task manually.

function finishActiveTask() {
    const task = getActiveTask();

    if (!task) {
        return;
    }

    pauseTimer();

    completeTask(task.id);

    closeFullscreenTimer();

    showToast("Task finished successfully!");
}


// Update the countdown display.

function updateTimerDisplay() {
    const task = getActiveTask();

    if (!task) {
        const pausedTask = tasks.find(item =>
            item.id === lastPausedTaskId &&
            !item.completed
        );

        if (!pausedTask) {
            activeTimerContent.innerHTML = `
                <p class="muted-text">
                    No active task. Start a task to begin tracking time.
                </p>
            `;

            return;
        }

        renderPausedTimer(pausedTask);

        return;
    }


    renderActiveTimer(task);
}


// Display a running task.

function renderActiveTimer(task) {
    const totalDuration =
        task.estimatedSeconds + task.extensionSeconds;

    const progress = totalDuration > 0
        ? ((totalDuration - task.remainingSeconds) / totalDuration) * 100
        : 0;

    activeTimerContent.innerHTML = `
        <div class="timer-display-wrapper">

            <h3>${escapeHTML(task.title)}</h3>

            <div class="active-timer-display">
                ${formatTime(task.remainingSeconds)}
            </div>

            <p class="muted-text">
                Remaining time
            </p>

            <div class="timer-progress">
                <div style="width: ${Math.min(100, progress)}%"></div>
            </div>

            <p class="muted-text">
                Actual time tracked:
                ${formatDuration(task.trackedSeconds)}
            </p>

            <div class="timer-controls">

                <button class="primary-btn" id="mainPauseBtn">
                    Pause
                </button>

                <button class="secondary-btn" id="mainFullscreenBtn">
                    Full Screen
                </button>

                <button class="secondary-btn" id="mainFinishBtn">
                    Finish Task
                </button>

            </div>
        </div>
    `;


    document.getElementById("mainPauseBtn")
        .addEventListener("click", () => {
            pauseTimer();
            showToast("Timer paused.");
        });


    document.getElementById("mainFullscreenBtn")
        .addEventListener("click", openFullscreenTimer);


    document.getElementById("mainFinishBtn")
        .addEventListener("click", finishActiveTask);


    updateFullscreenTimer();
}


// Display a paused task.

function renderPausedTimer(task) {
    activeTimerContent.innerHTML = `
        <div class="timer-display-wrapper">

            <h3>${escapeHTML(task.title)}</h3>

            <div class="active-timer-display">
                ${formatTime(task.remainingSeconds)}
            </div>

            <p class="muted-text">Timer paused</p>

            <p class="muted-text">
                Actual time tracked:
                ${formatDuration(task.trackedSeconds)}
            </p>

            <div class="timer-controls">

                <button class="primary-btn" id="mainResumeBtn">
                    Resume Timer
                </button>

                <button class="secondary-btn" id="mainFinishPausedBtn">
                    Finish Task
                </button>

            </div>
        </div>
    `;


    document.getElementById("mainResumeBtn")
        .addEventListener("click", () => {
            resumeTimer(task.id);
        });


    document.getElementById("mainFinishPausedBtn")
        .addEventListener("click", () => {
            completeTask(task.id);
            closeFullscreenTimer();
        });
}


// Run the timer update loop.

function startTimerUpdates() {
    clearInterval(timerInterval);

    if (!getActiveTask()) {
        timerInterval = null;
        return;
    }

    updateTimerDisplay();

    timerInterval = setInterval(() => {

        const task = getActiveTask();

        if (!task) {
            clearInterval(timerInterval);
            timerInterval = null;
            return;
        }

        const timeIsOver = updateRunningTask(task);

        saveTasks();

        if (timeIsOver) {
            handleTimerFinished(task);
            return;
        }

        updateTimerDisplay();

    }, 250);
}


/* =========================================
   11. TIME-UP PROMPT
========================================= */

// Show the prompt when the countdown reaches zero.

function showTimeUpModal(taskId) {
    const task = tasks.find(item =>
        item.id === taskId
    );

    if (!task) {
        return;
    }

    timeUpTaskId = taskId;

    document.getElementById("timeUpTaskName").textContent =
        task.title;

    timeUpModal.classList.remove("hidden");
}


// Close the time-up prompt.

function closeTimeUpModal() {
    timeUpModal.classList.add("hidden");

    timeUpTaskId = null;
}


// Mark the task complete from the prompt.

document.getElementById("timeUpCompleteBtn")
    .addEventListener("click", () => {

        const taskId = timeUpTaskId;

        if (!taskId) {
            return;
        }

        closeTimeUpModal();

        completeTask(taskId);

        closeFullscreenTimer();

        showToast("Task completed!");
    });


// Add 15 minutes and automatically resume.

document.getElementById("timeUpExtendBtn")
    .addEventListener("click", () => {

        const task = tasks.find(item =>
            item.id === timeUpTaskId
        );

        if (!task) {
            closeTimeUpModal();
            return;
        }

        task.extensionSeconds += EXTENSION_SECONDS;

        task.remainingSeconds += EXTENSION_SECONDS;

        const taskId = task.id;

        closeTimeUpModal();

        saveTasks();

        renderAll();

        startTimer(taskId);

        showToast("15 minutes added. Timer resumed!");
    });


// Keep the task paused.

document.getElementById("timeUpPauseBtn")
    .addEventListener("click", () => {

        closeTimeUpModal();

        renderAll();

        showToast("Task remains paused.");
    });


/* =========================================
   12. FULL SCREEN TIMER
========================================= */

async function openFullscreenTimer() {
    const task = getActiveTask();

    if (!task) {
        showToast("Start a task before opening the full-screen timer.");
        return;
    }

    fullscreenTimer.classList.remove("hidden");

    updateFullscreenTimer();

    try {
        if (!document.fullscreenElement) {
            await fullscreenTimer.requestFullscreen();
        }
    } catch (error) {
        console.warn("Full-screen mode is unavailable:", error);
    }
}


async function closeFullscreenTimer() {
    fullscreenTimer.classList.add("hidden");

    if (document.fullscreenElement) {
        try {
            await document.exitFullscreen();
        } catch (error) {
            console.warn("Could not exit full-screen mode:", error);
        }
    }
}


function updateFullscreenTimer() {
    const task = getActiveTask();

    if (!task) {
        const pausedTask = tasks.find(item =>
            item.id === lastPausedTaskId &&
            !item.completed
        );

        if (!pausedTask) {
            return;
        }

        displayFullscreenTask(pausedTask, false);

        return;
    }

    displayFullscreenTask(task, true);
}


function displayFullscreenTask(task, isRunning) {
    const totalDuration =
        task.estimatedSeconds + task.extensionSeconds;

    const progress = totalDuration > 0
        ? ((totalDuration - task.remainingSeconds) / totalDuration) * 100
        : 0;

    fullscreenTimerDisplay.textContent =
        formatTime(task.remainingSeconds);

    document.getElementById("fullscreenTaskName").textContent =
        task.title;

    document.getElementById("fullscreenEstimated").textContent =
        `Remaining time: ${formatDuration(task.remainingSeconds)}`;

    document.getElementById("fullscreenProgressBar").style.width =
        `${Math.min(100, progress)}%`;

    document.getElementById("fullscreenTimerStatus").textContent =
        isRunning ? "Timer is running" : "Timer paused";

    document.getElementById("fullscreenPauseBtn").textContent =
        isRunning ? "Pause" : "Resume";
}


// Pause or resume from fullscreen.

document.getElementById("fullscreenPauseBtn")
    .addEventListener("click", () => {

        const activeTask = getActiveTask();

        if (activeTask) {
            pauseTimer();

            showToast("Timer paused.");

            return;
        }

        const pausedTask = tasks.find(task =>
            task.id === lastPausedTaskId &&
            !task.completed
        );

        if (pausedTask) {
            resumeTimer(pausedTask.id);
            showToast("Timer resumed.");
        }
    });


// Finish task from fullscreen.

document.getElementById("fullscreenFinishBtn")
    .addEventListener("click", () => {

        const activeTask = getActiveTask();

        if (activeTask) {
            finishActiveTask();
            return;
        }

        const pausedTask = tasks.find(task =>
            task.id === lastPausedTaskId &&
            !task.completed
        );

        if (pausedTask) {
            completeTask(pausedTask.id);
            closeFullscreenTimer();
        }
    });


// Exit fullscreen.

document.getElementById("exitFullscreenBtn")
    .addEventListener("click", closeFullscreenTimer);


document.getElementById("expandTimerBtn")
    .addEventListener("click", openFullscreenTimer);


document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
        fullscreenTimer.classList.add("hidden");
    }
});


/* =========================================
   13. PAUSE WHEN WEBSITE CLOSES
========================================= */

// Save time and pause before a refresh or page close.
// The timer will not automatically restart after reopening.

window.addEventListener("pagehide", () => {

    const task = getActiveTask();

    if (!task) {
        return;
    }

    updateRunningTask(task);

    task.timer.isRunning = false;

    task.timer.startedAt = null;
    task.timer.lastTickAt = null;

    lastPausedTaskId = task.id;

    clearInterval(timerInterval);
    timerInterval = null;

    saveTasks();
});


/* =========================================
   14. SUMMARY CARDS
========================================= */

function renderSummary() {
    const total = tasks.length;

    const completed = tasks.filter(task =>
        task.completed
    ).length;

    const pending = total - completed;

    const tracked = tasks.reduce((sum, task) => {
        return sum + getTaskElapsed(task);
    }, 0);


    document.getElementById("totalTasks").textContent =
        total;

    document.getElementById("completedTasks").textContent =
        completed;

    document.getElementById("pendingTasks").textContent =
        pending;

    document.getElementById("totalTracked").textContent =
        formatDuration(tracked);
}


/* =========================================
   15. ANALYTICS
========================================= */

function getMonday(date) {
    const result = new Date(date);

    const day = result.getDay();

    const difference = day === 0 ? -6 : 1 - day;

    result.setDate(result.getDate() + difference);

    result.setHours(0, 0, 0, 0);

    return result;
}


function dateToString(date) {
    const year = date.getFullYear();

    const month = String(date.getMonth() + 1).padStart(2, "0");

    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function calculateAnalytics(period) {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    let startDate;
    let endDate;

    let chartLabels = [];


    if (period === "daily") {
        startDate = new Date(today);
        endDate = new Date(today);

        chartLabels = ["Today"];
    }


    if (period === "weekly") {
        startDate = getMonday(today);

        endDate = new Date(startDate);

        endDate.setDate(startDate.getDate() + 6);

        chartLabels = [
            "Mon", "Tue", "Wed", "Thu",
            "Fri", "Sat", "Sun"
        ];
    }


    if (period === "monthly") {
        startDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            1
        );

        endDate = new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            0
        );

        chartLabels = Array.from(
            { length: endDate.getDate() },
            (_, index) => String(index + 1)
        );
    }


    const startString = dateToString(startDate);

    const endString = dateToString(endDate);


    // Tasks scheduled in the selected period.

    const relevantTasks = tasks.filter(task =>
        task.date >= startString &&
        task.date <= endString
    );


    // Count only completed tasks from the relevant task group
    // whose completion date is inside the selected period.

    const completedTasks = relevantTasks.filter(task => {

        if (!task.completed || !task.completedAt) {
            return false;
        }

        const completedDate = getDateFromTimestamp(
            new Date(task.completedAt).getTime()
        );

        return completedDate >= startString &&
            completedDate <= endString;
    });


    let totalTrackedSeconds = 0;

    const chartValues = chartLabels.map(() => 0);


    tasks.forEach(task => {

        task.sessions.forEach(session => {

            if (
                session.date < startString ||
                session.date > endString
            ) {
                return;
            }

            totalTrackedSeconds += session.seconds;


            if (period === "daily") {
                chartValues[0] += session.seconds;
            }


            if (period === "weekly") {
                const sessionDate =
                    new Date(`${session.date}T00:00:00`);

                const dayIndex =
                    (sessionDate.getDay() + 6) % 7;

                chartValues[dayIndex] += session.seconds;
            }


            if (period === "monthly") {
                const dayIndex =
                    Number(session.date.slice(8, 10)) - 1;

                chartValues[dayIndex] += session.seconds;
            }

        });

    });


    const total = relevantTasks.length;

    const completed = completedTasks.length;

    const completionRate = total > 0
        ? Math.round((completed / total) * 100)
        : 0;


    return {
        total,
        completed,
        completionRate,
        totalTrackedSeconds,
        chartLabels,
        chartValues
    };
}


function renderAnalytics() {
    const period =
        document.getElementById("analyticsPeriod").value;

    const result = calculateAnalytics(period);


    document.getElementById("analyticsCompleted").textContent =
        result.completed;

    document.getElementById("analyticsTotal").textContent =
        result.total;

    document.getElementById("analyticsRate").textContent =
        `${result.completionRate}%`;

    document.getElementById("analyticsTime").textContent =
        formatDuration(result.totalTrackedSeconds);


    const chartTitle =
        document.getElementById("chartTitle");


    if (period === "daily") {
        chartTitle.textContent = "Today's Tracked Time";
    }

    if (period === "weekly") {
        chartTitle.textContent = "Weekly Tracked Time";
    }

    if (period === "monthly") {
        chartTitle.textContent = "Monthly Tracked Time";
    }


    renderChart(
        result.chartLabels,
        result.chartValues
    );


    document.getElementById("analyticsDescription").textContent =
        `Showing ${period} activity. Completion rate is based on tasks scheduled in this period.`;
}


function renderChart(labels, values) {
    const chart =
        document.getElementById("analyticsChart");

    const maximumValue = Math.max(...values, 1);


    chart.innerHTML = labels.map((label, index) => {

        const value = values[index];

        const height = (value / maximumValue) * 100;

        const barHeight = Math.max(
            height,
            value > 0 ? 4 : 1
        );


        return `
            <div class="bar-item">

                <span class="bar-value">
                    ${value > 0 ? formatDuration(value) : ""}
                </span>

                <div
                    class="bar"
                    style="height: ${barHeight}%"
                    title="${value} seconds">
                </div>

                <span class="bar-label">
                    ${label}
                </span>

            </div>
        `;

    }).join("");
}


/* =========================================
   16. EXPORT DATA
========================================= */

function exportData() {
    const backup = {
        exportedAt: new Date().toISOString(),
        tasks: tasks
    };


    const file = new Blob(
        [JSON.stringify(backup, null, 4)],
        { type: "application/json" }
    );


    const url = URL.createObjectURL(file);

    const link = document.createElement("a");

    link.href = url;

    link.download = "taskcraft-backup.json";

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

    showToast("Backup exported successfully.");
}


/* =========================================
   17. IMPORT DATA
========================================= */

function importData(event) {
    const file = event.target.files[0];

    if (!file) {
        return;
    }

    const reader = new FileReader();


    reader.onload = () => {

        try {
            const backup = JSON.parse(reader.result);

            if (!Array.isArray(backup.tasks)) {
                throw new Error("Invalid backup format.");
            }

            const validTasks = backup.tasks.every(task => {

                return task &&
                    typeof task.id === "string" &&
                    typeof task.title === "string" &&
                    Number.isFinite(Number(task.estimatedSeconds)) &&
                    Number.isFinite(Number(task.trackedSeconds));
            });


            if (!validTasks) {
                throw new Error("Invalid task information.");
            }


            if (!confirm(
                "Importing will replace your current task list. Continue?"
            )) {
                event.target.value = "";
                return;
            }


            tasks = backup.tasks.map(task =>
                normalizeTask(task)
            );

            // Imported timers always remain paused.

            tasks.forEach(task => {
                task.timer.isRunning = false;
                task.timer.startedAt = null;
                task.timer.lastTickAt = null;
            });

            lastPausedTaskId = null;

            closeTimeUpModal();

            saveTasks();

            renderAll();

            showToast("Backup imported successfully.");

        } catch (error) {
            showToast("Could not import this backup.");

            console.error(error);
        }

        event.target.value = "";
    };


    reader.readAsText(file);
}


/* =========================================
   18. RENDER THE DASHBOARD
========================================= */

function renderAll() {
    renderTasks();

    renderSummary();

    renderAnalytics();

    updateTimerDisplay();

    updateFullscreenTimer();
}


/* =========================================
   19. EVENT LISTENERS
========================================= */

taskForm.addEventListener("submit", saveTask);


document.getElementById("cancelEditBtn")
    .addEventListener("click", resetTaskForm);


document.getElementById("themeToggle")
    .addEventListener("click", toggleTheme);


document.getElementById("statusFilter")
    .addEventListener("change", renderTasks);


document.getElementById("sortTasks")
    .addEventListener("change", renderTasks);


document.getElementById("analyticsPeriod")
    .addEventListener("change", renderAnalytics);


document.getElementById("exportBtn")
    .addEventListener("click", exportData);


document.getElementById("importFile")
    .addEventListener("change", importData);


/* =========================================
   20. APPLICATION STARTUP
========================================= */

loadTheme();

loadTasks();

document.getElementById("taskDate").value = getToday();

document.getElementById("currentDate").textContent =
    new Date().toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });

renderAll();

// Do not restart an old timer automatically.
// All previously running timers are paused on startup.
startTimerUpdates();