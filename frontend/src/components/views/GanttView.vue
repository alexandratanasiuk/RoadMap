<template>
  <div class="gantt-view">
    <div class="gantt-header">
      <div class="gantt-controls">
        <button class="btn btn-small btn-icon" title="Увеличить" aria-label="Увеличить" @click="zoomIn">➕</button>
        <button class="btn btn-small btn-icon" title="Уменьшить" aria-label="Уменьшить" @click="zoomOut">➖</button>
        <button class="btn btn-small btn-icon" title="Сбросить масштаб" aria-label="Сбросить масштаб" @click="resetZoom">🔄</button>
        <button
          class="btn btn-small btn-icon"
          :class="{ active: ganttRiskOnly }"
          title="Только рисковые"
          aria-label="Только рисковые"
          @click="ganttRiskOnly = !ganttRiskOnly"
        >
          ⚠️
        </button>
        <button
          class="btn btn-small btn-icon"
          :class="{ active: showCriticalPath }"
          title="Критический путь: подсвечивает цепочку задач с максимальной суммой часов внутри этапа."
          aria-label="Критический путь"
          @click="showCriticalPath = !showCriticalPath"
        >
          🔗
        </button>
        <button
          class="btn btn-small btn-icon"
          :disabled="readOnly || isLevelingResources"
          :title="isLevelingResources
            ? 'Автораспределение...'
            : 'Открыть настройки автораспределения задач'"
          aria-label="Автоматическое выравнивание ресурсов"
          @click="openAutoLevelModal"
        >
          ⚖️
        </button>
        <button
          class="btn btn-small btn-icon"
          :disabled="
            readOnly ||
            isUndoLevelingResources ||
            isUndoLastManualGanttEdit ||
            (!lastManualGanttEditSnapshot && !levelingSnapshot)
          "
          :title="
            isUndoLastManualGanttEdit
              ? 'Отмена последнего изменения...'
              : lastManualGanttEditSnapshot
                ? 'Отменить последнее изменение этапа/задачи/линий связи'
                : isUndoLevelingResources
                  ? 'Откат выравнивания...'
                  : 'Откатить последнее автовыравнивание ресурсов'
          "
          :aria-label="
            lastManualGanttEditSnapshot
              ? 'Отменить последнее изменение этапа/задачи/линий связи'
              : 'Откатить последнее выравнивание ресурсов'
          "
          @click="undoLastStageOrTaskEdit"
        >
          ↩️
        </button>
      </div>
      <div class="gantt-leveling-hint">
        ⚖️ Автораспределение: равномерно делит трудозатраты этапа между задачами (5 ч/день на сотрудника).
      </div>
      <div v-if="showCriticalPath" class="gantt-critical-hint">
        <strong>Памятка:</strong> подсвеченные задачи сильнее всего влияют на срок этапа; приоритезируйте их. Расчет идет по сумме часов задач.
      </div>
    </div>

    <div class="gantt-container">
        <div class="gantt-sidebar">
        <div class="sidebar-header" :class="{ 'sidebar-header--day-scale': scaleMode === 'day' }">
          <button
            class="stage-caret sidebar-expand-all"
            type="button"
            :title="allVisibleStagesExpanded ? 'Свернуть все этапы' : 'Развернуть все этапы'"
            :aria-label="allVisibleStagesExpanded ? 'Свернуть все этапы' : 'Развернуть все этапы'"
            @click="toggleAllVisibleStagesExpanded"
          >
            <span
              class="stage-caret-icon"
              :class="{ 'stage-caret-icon--expanded': allVisibleStagesExpanded }"
              aria-hidden="true"
            >
              ›
            </span>
          </button>
          <span>ЭТАПЫ И ЗАДАЧИ</span>
        </div>
          <div class="sidebar-tasks" ref="sidebarTasks" @scroll="onSidebarScroll">
            <div
              v-for="block in filteredGanttBlocks"
              :key="block.id"
              class="stage-wrapper"
              :style="{ height: getStageWrapperHeight(block) + 'px' }"
            >
              <div
                class="sidebar-task-row"
                :class="{
                  'hovered': hoveredRowId === block.id,
                  'critical-path-stage-row': showCriticalPath && isCriticalStage(block),
                  'overdue-stage-row': isOverdue(block)
                }"
                @mouseenter="hoveredRowId = block.id"
                @mouseleave="hoveredRowId = null"
                :title="block.title"
              >
                <div class="stage-row-left">
                  <button
                    class="stage-caret"
                    type="button"
                    @click.stop="toggleExpanded(block.id)"
                    :aria-expanded="isBlockExpanded(block.id)"
                    :title="isBlockExpanded(block.id) ? 'Свернуть' : 'Развернуть'"
                  >
                    <span
                      class="stage-caret-icon"
                      :class="{ 'stage-caret-icon--expanded': isBlockExpanded(block.id) }"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </button>
                  <div class="stage-main">
                    <span
                      class="task-title task-title--clickable"
                      :title="block.title"
                      role="button"
                      tabindex="0"
                      @click.stop="emit('edit-block', block)"
                      @keydown.enter.stop.prevent="emit('edit-block', block)"
                    >
                      {{ block.title }}
                    </span>
                    <div class="sidebar-date-row" @click.stop>
                      <input
                        class="sidebar-date-input sidebar-date-input--subtle"
                        type="date"
                        :value="block.startDate || ''"
                        :disabled="readOnly"
                        @click.stop
                        @change="onStageDateInputChange(block, 'startDate', $event?.target?.value)"
                      />
                      <span class="sidebar-date-sep">—</span>
                      <input
                        class="sidebar-date-input sidebar-date-input--subtle"
                        type="date"
                        :value="block.releaseDate || ''"
                        :disabled="readOnly"
                        @click.stop
                        @change="onStageDateInputChange(block, 'releaseDate', $event?.target?.value)"
                      />
                    </div>
                  </div>
                </div>

                <div class="stage-row-right">
                  <span v-if="isOverdue(block)" class="overdue-fire-badge overdue-fire-badge--stage" title="Просрочен">🔥</span>
                  <span v-if="ganttSidebarMeta(block)" class="task-gantt-meta">{{ ganttSidebarMeta(block) }}</span>
                  <button
                    v-if="!readOnly"
                    class="stage-reset-btn"
                    type="button"
                    @click.stop="resetStageTaskDates(block)"
                    title="Сбросить даты задач на начало этапа"
                  >
                    ⟲
                  </button>
                </div>
              </div>

              <div
                v-if="isBlockExpanded(block.id) && block.tasks && block.tasks.length"
                class="stage-tasks-list"
                @dragover="onTaskDragOver"
                @drop="onTaskDrop($event, block, null)"
              >
                <div class="dropdown-tasks">
                  <div
                    v-for="(task, idx) in getSortedBlockTasks(block)"
                    :key="task.id || idx"
                    class="dropdown-task-row"
                    :class="{
                      'drag-over': isTaskDragOver(block, task),
                      'dragging': draggedTask?.id === task.id,
                      'has-predecessors': taskHasPredecessors(task),
                      'overdue-task-row': isTaskOverdue(task)
                    }"
                    :title="taskGanttTitle(block, task)"
                    :draggable="!readOnly"
                    @dragstart="onTaskDragStart($event, block, task)"
                    @dragend="onTaskDragEnd"
                    @dragover="onTaskDragOver"
                    @dragenter="onTaskDragEnter(block, task)"
                    @dragleave="onTaskDragLeave"
                    @drop="onTaskDrop($event, block, task)"
                  >
                    <div class="dropdown-task-main">
                      <div class="dropdown-task-title-row">
                        <button
                          type="button"
                          class="dropdown-task-status"
                          :title="getStatusTitle(task.status || 'todo')"
                          @click.stop="tryCycleTaskStatus(block, task, $event)"
                        >
                          <span :style="{ color: getTaskStatusColor(task.status) }">
                            {{ getTaskStatusIcon(task.status) }}
                          </span>
                        </button>
                        <span
                          class="dropdown-task-title"
                          role="button"
                          tabindex="0"
                          :title="task.title"
                          @click.stop.prevent="openTaskCardModal(block, task)"
                          @keydown.enter.stop.prevent="openTaskCardModal(block, task)"
                        >
                          <span v-if="taskHasPredecessors(task)" class="task-pred-dot" aria-hidden="true">↳</span>
                          {{ task.title }}
                        </span>
                        <div class="dropdown-task-right-icons">
                          <span v-if="isTaskOverdue(task)" class="overdue-fire-badge overdue-fire-badge--task" title="Просрочена">🔥</span>
                          <button
                            v-if="normalizeLinkUrl(task.linkUrl)"
                            class="dropdown-task-link-btn"
                            type="button"
                            title="Открыть ссылку"
                            @click.stop="openTaskLink(task)"
                          >
                            <img class="dropdown-task-link-img" :src="linkIcon" alt="" />
                          </button>
                          <span v-else class="dropdown-task-link-spacer" aria-hidden="true"></span>
                        </div>
                      </div>
                      <div class="sidebar-date-row sidebar-date-row--task" @click.stop>
                        <input
                          class="sidebar-date-input sidebar-date-input--task sidebar-date-input--subtle"
                          type="date"
                          :value="task.startDate || ''"
                          :disabled="readOnly"
                          @click.stop
                          @change="onTaskDateInputChange(block, task, 'startDate', $event?.target?.value)"
                        />
                        <span class="sidebar-date-sep">—</span>
                        <input
                          class="sidebar-date-input sidebar-date-input--task sidebar-date-input--subtle"
                          type="date"
                          :value="task.releaseDate || ''"
                          :disabled="readOnly"
                          @click.stop
                          @change="onTaskDateInputChange(block, task, 'releaseDate', $event?.target?.value)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>

      <div class="gantt-timeline-panel" ref="ganttTimelinePanel" @scroll="onGanttTimelinePanelScroll">
        <div
          class="timeline-header"
          :class="{ 'timeline-header--day-scale': scaleMode === 'day' }"
          :style="{ width: totalTimelineWidth + 'px' }"
        >
          <template v-if="scaleMode === 'day'">
            <div class="timeline-header-rows">
              <div class="timeline-header-row timeline-header-row--month">
                <div
                  v-for="cell in dayScaleMonthCells"
                  :key="cell.key"
                  class="timeline-unit timeline-unit--month"
                  :style="{ position: 'absolute', left: cell.left + 'px', width: cell.width + 'px' }"
                >
                  <div class="tick-label tick-label--month">{{ cell.label }}</div>
                </div>
              </div>
              <div class="timeline-header-row timeline-header-row--week">
                <div
                  v-for="cell in dayScaleWeekCells"
                  :key="cell.key"
                  class="timeline-unit timeline-unit--week"
                  :style="{ position: 'absolute', left: cell.left + 'px', width: cell.width + 'px' }"
                >
                  <div class="tick-label tick-label--week">{{ cell.label }}</div>
                </div>
              </div>
              <div class="timeline-header-row timeline-header-row--day">
                <div
                  v-for="cell in dayScaleDayCells"
                  :key="cell.key"
                  class="timeline-unit timeline-unit--day"
                  :style="{ position: 'absolute', left: cell.left + 'px', width: cell.width + 'px' }"
                >
                  <div class="tick-label tick-label--day">{{ cell.label }}</div>
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <div
              v-for="tick in headerTicks"
              :key="tick.key"
              class="timeline-unit"
              :style="{ position: 'absolute', left: tick.left + 'px', width: tick.width + 'px' }"
            >
              <div class="tick-label">{{ tick.label }}</div>
            </div>
          </template>
        </div>

        <div class="timeline-tasks" ref="timelineTasks" :style="{ width: totalTimelineWidth + 'px' }" @scroll="onTimelineScroll">
          <div
            class="tasks-wrapper"
            :style="{ width: totalTimelineWidth + 'px' }"
          >
            <div class="days-grid" :style="{ width: totalTimelineWidth + 'px' }">
              <div v-for="i in visibleRange.days" :key="i" class="grid-day" :style="{ width: dayWidth + 'px' }"></div>
            </div>
            <div class="gantt-calendar-highlights" :style="{ width: totalTimelineWidth + 'px' }">
              <div
                v-for="day in calendarHighlightedDays"
                :key="day.key"
                class="gantt-calendar-highlight-day"
                :class="{
                  'is-weekend': day.isWeekend && !day.isHoliday,
                  'is-holiday': day.isHoliday
                }"
                :style="{ left: day.left + 'px', width: dayWidth + 'px' }"
              ></div>
            </div>
            <div class="gantt-month-dividers" :style="{ width: totalTimelineWidth + 'px' }">
              <div
                v-for="divider in monthDividers"
                :key="divider.key"
                class="gantt-month-divider"
                :style="{ left: divider.left + 'px' }"
              ></div>
            </div>

            <div v-if="todayOffsetDays >= 0 && todayOffsetDays < visibleRange.days" class="today-line" :style="{ left: todayOffsetDays * dayWidth + 'px' }">
              <div class="today-label">Сегодня</div>
            </div>

            <div class="tasks-container" :style="{ width: totalTimelineWidth + 'px' }">
              <div
                v-for="block in filteredGanttBlocks"
                :key="block.id"
                class="timeline-task-row-wrapper"
                :data-block-id="String(block.id)"
                :style="{ width: totalTimelineWidth + 'px', height: getStageWrapperHeight(block) + 'px' }"
                @mouseenter="hoveredRowId = block.id"
                @mouseleave="hoveredRowId = null"
              >
                <div class="timeline-task-row" :class="{ 'hovered': hoveredRowId === block.id }"
                  @mouseenter="hoveredRowId = block.id" @mouseleave="hoveredRowId = null">
                  <div
                    class="task-bar"
                    :class="{
                    'completed': block.completed,
                    'in-progress': !block.completed && getTaskProgress(block) > 0,
                    'not-started': !block.completed && getTaskProgress(block) === 0,
                    'stage-has-active-work': !block.completed && blockHasTaskInProgress(block),
                    'overdue': isOverdue(block),
                    'task-risk': getGanttStatus(block) === 'risk',
                    'task-delayed': getGanttStatus(block) === 'delayed',
                    'critical-path-stage': showCriticalPath && isCriticalStage(block)
                    }"
                    :style="getBarStyleWithPreview(block)"
                    @mouseenter="onStageBarTooltipEnter($event, block)"
                    @mousemove="onStageBarTooltipMove($event)"
                    @mouseleave="onStageBarTooltipLeave"
                    @mousedown.prevent.stop="onBarMouseDown(block, 'move', $event)"
                  >
                    <div class="bar-handle left" @mousedown.prevent.stop="onBarMouseDown(block, 'resize-left', $event)" />
                    <div class="bar-handle right" @mousedown.prevent.stop="onBarMouseDown(block, 'resize-right', $event)" />
                    <button
                      v-if="!readOnly"
                      type="button"
                      class="gantt-stage-add-link"
                      tabindex="0"
                      draggable="false"
                      title="Потянуть связь к другому этапу (он станет зависимым от этого)"
                      @dragstart.stop.prevent
                      @pointerdown.stop.prevent="onStageLinkPointerDown($event, block)"
                      @pointermove="onStageLinkPointerMove"
                      @pointerup="onStageLinkPointerUp"
                      @pointercancel="onStageLinkPointerCancel"
                    >
                      +
                    </button>

                    <div class="task-progress" :style="{ width: getTaskProgress(block) + '%' }"></div>

                  </div>

                  <div
                    v-if="isBlockExpanded(block.id) && block.tasks && block.tasks.length"
                    class="task-sub-bars"
                    @dragover="onTaskDragOver"
                    @drop="onTaskDrop($event, block, null)"
                  >
                    <div
                      v-for="(task, idx) in getSortedBlockTasks(block)"
                      :key="task.id || idx"
                      class="task-sub-bar-wrap"
                      :data-block-id="block.id"
                      :data-task-id="task.id"
                      :class="{
                        'drag-over': isTaskDragOver(block, task),
                        'dragging': draggedTask?.id === task.id,
                        'task-date-dragging': isTaskBarDragging(block, task, idx),
                        'has-predecessors': taskHasPredecessors(task),
                        'critical-path-task': showCriticalPath && isCriticalTask(block, task, idx),
                        'overdue-task': isTaskOverdue(task),
                        'overflow-tail-task': isTaskOverflowingStage(block, task)
                      }"
                      :title="taskGanttTitle(block, task)"
                      :style="getTaskBarPositionStyle(block, idx)"
                      :draggable="!readOnly && !taskBarDrag"
                      @dragstart="onTaskDragStart($event, block, task)"
                      @dragend="onTaskDragEnd"
                      @dragover="onTaskDragOver"
                      @dragenter="onTaskDragEnter(block, task)"
                      @dragleave="onTaskDragLeave"
                      @drop="onTaskDrop($event, block, task)"
                      @mouseenter="onTaskBarEnter(block, task)"
                      @mouseleave="onTaskBarLeave"
                    >
                      <div
                        class="task-sub-bar-inner"
                        :style="{ backgroundColor: getTaskBarColor(task) }"
                        @mousedown.prevent.stop="onTaskBarMouseDown(block, task, idx, $event, 'move')"
                      >
                        <div
                          class="task-sub-bar-handle task-sub-bar-handle--left"
                          @mousedown.prevent.stop="onTaskBarMouseDown(block, task, idx, $event, 'resize-left')"
                        />
                        <div
                          class="task-sub-bar-handle task-sub-bar-handle--right"
                          @mousedown.prevent.stop="onTaskBarMouseDown(block, task, idx, $event, 'resize-right')"
                        />
                        <span
                          v-if="getTaskDragInlineLabel(block, task, idx)"
                          class="task-sub-bar-drag-dates"
                        >
                          {{ getTaskDragInlineLabel(block, task, idx) }}
                        </span>
                      </div>
                      <div
                        class="task-sub-bar-end"
                        :style="{ backgroundColor: getTaskBarColor(task) }"
                        @pointerdown.stop.prevent="onTaskLinkStartPointerDown($event, block, task, idx)"
                      >
                        <button
                          v-if="!readOnly"
                          type="button"
                          class="gantt-sub-bar-add-link"
                          draggable="false"
                          title="Потянуть связь к другой задаче (она станет зависимой от этой)"
                          @dragstart.stop.prevent
                          @pointerdown.stop.prevent="onNewLinkPointerDown($event, block, task, idx)"
                          @pointermove="onNewLinkPointerMove"
                          @pointerup="onNewLinkPointerUp"
                          @pointercancel="onNewLinkPointerCancel"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <svg
              ref="ganttDepsSvg"
              class="gantt-dependencies"
              xmlns="http://www.w3.org/2000/svg"
              :viewBox="`0 0 ${totalTimelineWidth} ${tasksWrapperContentHeight}`"
              :width="totalTimelineWidth"
              :height="tasksWrapperContentHeight"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="gantt-dep-arr-todo"
                  class="gantt-dep-marker"
                  viewBox="0 0 10 8"
                  markerWidth="9"
                  markerHeight="8"
                  refX="8.8"
                  refY="4"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M 8.6 4 L 0.8 0.8 L 0.8 7.2 Z" fill="#94a3b8" fill-opacity="0.96" />
                </marker>
                <marker
                  id="gantt-dep-arr-progress"
                  class="gantt-dep-marker"
                  viewBox="0 0 10 8"
                  markerWidth="9"
                  markerHeight="8"
                  refX="8.8"
                  refY="4"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M 8.6 4 L 0.8 0.8 L 0.8 7.2 Z" fill="#166534" fill-opacity="0.98" />
                </marker>
                <marker
                  id="gantt-dep-arr-done"
                  class="gantt-dep-marker"
                  viewBox="0 0 10 8"
                  markerWidth="9"
                  markerHeight="8"
                  refX="8.8"
                  refY="4"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M 8.6 4 L 0.8 0.8 L 0.8 7.2 Z" fill="#90EE90" fill-opacity="0.96" />
                </marker>
                <marker
                  id="gantt-dep-arr-stage"
                  class="gantt-dep-marker"
                  viewBox="0 0 10 8"
                  markerWidth="9"
                  markerHeight="8"
                  refX="8.8"
                  refY="4"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M 8.6 4 L 0.8 0.8 L 0.8 7.2 Z" fill="#483D8B" fill-opacity="0.98" />
                </marker>
              </defs>
              <path
                v-for="seg in stageDependencyEdges"
                :key="seg.key"
                :d="seg.d"
                class="gantt-stage-dependency-path"
                fill="none"
                @mouseenter="onStageDepPathHintEnter($event)"
                @mousemove="onStageDepPathHintMove($event)"
                @mouseleave="onStageDepPathHintLeave"
                @click.stop.prevent="onStageDepPathClick($event, seg)"
                @dblclick.stop.prevent="onStageDepPathDblClick($event, seg)"
              />
              <template v-for="seg in stageDependencyEdges" :key="seg.key + '-mark'">
                <g v-if="seg.hasLabel" class="gantt-stage-dep-marker-group">
                  <circle
                    :cx="seg.mx"
                    :cy="seg.my"
                    r="7"
                    class="gantt-stage-dep-marker gantt-stage-dep-marker--filled"
                    @click.stop.prevent="openStageLabelEditor($event, seg)"
                    @dblclick.stop.prevent="onStageDepPathDblClick($event, seg)"
                    @mouseenter="onStageDepMarkerEnter($event, seg)"
                    @mouseleave="onStageDepMarkerLeave"
                  />
                </g>
              </template>
              <path
                v-for="seg in ganttDependencyEdges"
                :key="seg.key"
                :d="seg.d"
                class="gantt-dependency-path"
                :class="{ 'gantt-dependency-path--highlighted': isTaskDepHighlighted(seg) }"
                fill="none"
                :stroke="seg.stroke"
              />
              <circle
                v-for="seg in ganttDependencyEdges"
                :key="seg.key + '-end-dot'"
                class="gantt-dependency-end-dot"
                :cx="seg.x2"
                :cy="seg.y2"
                r="4"
                :fill="seg.stroke"
              />
              <circle
                v-for="seg in stageDependencyEdges"
                :key="seg.key + '-end-dot'"
                class="gantt-stage-dep-end-dot"
                :cx="seg.x2"
                :cy="seg.y2"
                r="4.2"
              />
              <path
                v-for="seg in ganttDependencyEdges"
                :key="seg.key + '-hit'"
                :d="seg.d"
                class="gantt-dependency-hit"
                fill="none"
                stroke="transparent"
                title="Двойной клик — удалить связь задач"
                @click.stop.prevent="onTaskDepPathClick($event, seg)"
                @dblclick.stop.prevent="onTaskDepPathDblClick(seg)"
              />
              <path
                v-if="depDragPreviewD"
                :d="depDragPreviewD"
                class="gantt-dependency-preview"
                fill="none"
              />
              <path
                v-if="newLinkPreviewD"
                :d="newLinkPreviewD"
                class="gantt-new-link-preview"
                fill="none"
              />
              <path
                v-if="stageLinkPreviewD"
                :d="stageLinkPreviewD"
                class="gantt-stage-link-preview"
                fill="none"
              />
              <circle
                v-for="seg in ganttDependencyEdges"
                :key="seg.key + '-tail'"
                class="gantt-dep-handle gantt-dep-handle-tail"
                :cx="seg.x1"
                :cy="seg.y1"
                r="4"
                :fill="seg.stroke"
                stroke="#ffffff"
                stroke-width="1.4"
                @pointerdown="onDepHandlePointerDown($event, seg, 'from')"
                @pointermove="onDepHandlePointerMove"
                @pointerup="onDepHandlePointerUp"
                @pointercancel="onDepHandlePointerCancel"
              />
              <circle
                v-for="seg in ganttDependencyEdges"
                :key="seg.key + '-head'"
                class="gantt-dep-handle gantt-dep-handle-head"
                :cx="seg.x2"
                :cy="seg.y2"
                r="9"
                fill="transparent"
                stroke="transparent"
                @pointerdown="onDepHandlePointerDown($event, seg, 'to')"
                @pointermove="onDepHandlePointerMove"
                @pointerup="onDepHandlePointerUp"
                @pointercancel="onDepHandlePointerCancel"
              />
            </svg>
            <div
              v-if="dragDateTooltip"
              class="gantt-drag-date-tooltip"
              :style="{ left: dragDateTooltip.left + 'px', top: dragDateTooltip.top + 'px' }"
            >
              {{ dragDateTooltip.text }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="stageLabelEditor"
      class="stage-dep-label-popover"
      :style="{ left: stageLabelPopoverLeft + 'px', top: stageLabelPopoverTop + 'px' }"
      @mousedown.stop
    >
      <div class="stage-dep-label-popover-title">Заметка к связи этапов</div>
      <label class="stage-dep-label-field">
        <span>Тип</span>
        <select v-model="stageLabelEditor.kind">
          <option value="comment">Комментарий</option>
          <option value="checkpoint">Чекпоинт</option>
          <option value="date">Дата / веха</option>
        </select>
      </label>
      <label v-if="stageLabelEditor.kind === 'date'" class="stage-dep-label-field">
        <span>Дата</span>
        <input v-model="stageLabelEditor.dateStr" type="date" />
      </label>
      <label class="stage-dep-label-field">
        <span>Описание</span>
        <textarea v-model="stageLabelEditor.text" rows="4" placeholder="Как связаны этапы, условие, напоминание…" />
      </label>
      <div class="stage-dep-label-actions">
        <button type="button" class="btn btn-small" @click="saveStageLabelEditor">Сохранить</button>
        <button type="button" class="btn btn-small btn-ghost" @click="closeStageLabelEditor">Отмена</button>
      </div>
    </div>

    <div
      v-if="taskDepEditor"
      class="stage-dep-label-popover task-dep-popover"
      :style="{ left: taskDepPopoverLeft + 'px', top: taskDepPopoverTop + 'px' }"
      @mousedown.stop
    >
      <div class="stage-dep-label-popover-title">Связь задач</div>
      <label class="stage-dep-label-field">
        <span>Тип</span>
        <select v-model="taskDepEditor.type">
          <option value="FS">FS — Финиш-Старт</option>
          <option value="SS">SS — Старт-Старт</option>
          <option value="FF">FF — Финиш-Финиш</option>
          <option value="SF">SF — Старт-Финиш</option>
        </select>
      </label>
      <label class="stage-dep-label-field">
        <span>Лаг, дни</span>
        <input v-model.number="taskDepEditor.lagDays" type="number" step="1" />
      </label>
      <div class="stage-dep-label-actions">
        <button type="button" class="btn btn-small" @click="saveTaskDepEditor">Сохранить</button>
        <button type="button" class="btn btn-small btn-ghost" @click="closeTaskDepEditor">Отмена</button>
      </div>
    </div>

    <div
      v-if="stageBarTooltip"
      class="gantt-stage-bar-tooltip"
      :style="{ left: stageBarTooltip.x + 'px', top: stageBarTooltip.y + 'px' }"
    >
      {{ stageBarTooltip.text }}
    </div>

    <div
      v-if="stagePathHintTooltip"
      class="stage-dep-label-tooltip"
      :style="{ left: stagePathHintTooltip.x + 'px', top: stagePathHintTooltip.y + 'px' }"
    >
      {{ stagePathHintTooltip.text }}
    </div>

    <div
      v-if="stageLabelTooltip"
      class="stage-dep-label-tooltip"
      :style="{ left: stageLabelTooltip.x + 'px', top: stageLabelTooltip.y + 'px' }"
    >
      {{ stageLabelTooltip.text }}
    </div>

    <TaskCardModal
      v-if="taskCardModalOpen"
      :block="taskCardBlock"
      :task="taskCardTask"
      @close="closeTaskCardModal"
      @save="saveTaskCardModal"
      @delete="deleteTaskCardModal"
    />

    <div v-if="autoLevelModalOpen" class="auto-level-modal-overlay">
      <div class="auto-level-modal">
        <div class="auto-level-modal__head">
          <h3>Автораспределение задач</h3>
          <button type="button" class="auto-level-modal__close" @click="closeAutoLevelModal">✕</button>
        </div>
        <div class="auto-level-modal__body">
          <div class="auto-level-field">
            <span>Этапы</span>
            <div class="auto-level-stage-actions">
              <button type="button" class="btn btn-small btn-ghost" @click="selectAllAutoLevelStages">Все этапы</button>
              <button type="button" class="btn btn-small btn-ghost" @click="clearAllAutoLevelStages">Снять все</button>
            </div>
            <div class="auto-level-stage-list">
              <label
                v-for="block in autoLevelExpandedBlocks"
                :key="block.id"
                class="auto-level-stage-item"
              >
                <input
                  :checked="autoLevelSelectedBlockIds.includes(String(block.id))"
                  type="checkbox"
                  @change="toggleAutoLevelStageSelection(block.id, $event?.target?.checked)"
                />
                <span>{{ block.title }}</span>
              </label>
            </div>
          </div>
          <label class="auto-level-field">
            <span>Количество сотрудников</span>
            <div class="auto-level-employee-stepper">
              <button
                type="button"
                class="btn btn-small btn-ghost"
                @click.stop.prevent="decrementAutoLevelEmployeeCount"
              >
                −
              </button>
              <input
                :value="autoLevelEmployeeCount"
                type="number"
                min="1"
                max="100"
                step="1"
                @input="setAutoLevelEmployeeCount($event?.target?.value)"
              />
              <button
                type="button"
                class="btn btn-small btn-ghost"
                @click.stop.prevent="incrementAutoLevelEmployeeCount"
              >
                +
              </button>
            </div>
          </label>
          <div class="auto-level-mode-row">
            <label
              class="auto-level-mode-choice"
              :class="{ active: autoLevelDistributionMode === 'effort' }"
            >
              <input v-model="autoLevelDistributionMode" type="radio" value="effort" />
              <span>По трудозатратам</span>
            </label>
            <label
              class="auto-level-mode-choice"
              :class="{ active: autoLevelDistributionMode === 'duration' }"
            >
              <input v-model="autoLevelDistributionMode" type="radio" value="duration" />
              <span>По длительности этапа</span>
            </label>
          </div>
          <label v-if="autoLevelSelectedBlockIds.length <= 1" class="auto-level-field">
            <span>Общие трудозатраты этапа, часы</span>
            <div class="auto-level-slider-wrap">
              <input v-model.number="autoLevelTotalEffort" type="range" min="1" max="1000" step="1" />
              <strong>{{ Math.round(autoLevelTotalEffort) }}</strong>
            </div>
          </label>
          <div v-else class="auto-level-note">
            Для нескольких этапов используются текущие трудозатраты каждого этапа.
          </div>
          <label class="auto-level-checkbox">
            <input v-model="autoLevelIncludeWeekends" type="checkbox" />
            <span>Учитывать выходные дни в расписании</span>
          </label>
          <label class="auto-level-checkbox">
            <input v-model="autoLevelCreateLinks" type="checkbox" />
            <span>Связывать задачи линиями</span>
          </label>
          <div v-if="autoLevelDistributionMode === 'effort'" class="auto-level-note">
            Расчет: трудозатраты этапа делятся поровну между задачами; емкость команды —
            <strong>{{ autoLevelEmployeeCount }} × 5 = {{ autoLevelEmployeeCount * 5 }} ч/день</strong>.
            Следующая задача стартует на следующий календарный/рабочий день.
          </div>
          <div v-else class="auto-level-note">
            Расчет: длительности задач распределяются по рабочим дням этапа ({{ autoLevelStageWorkingDays }} рабочих дней).
            В среднем при {{ autoLevelEmployeeCount }} сотрудниках получится: <strong>{{ autoLevelDurationRequiredHoursPerEmployeePerDay.toFixed(1) }} ч/день</strong>.
            Следующая задача стартует на следующий календарный/рабочий день.
          </div>
          <div v-if="autoLevelDistributionMode === 'effort' && autoLevelHasOverload" class="auto-level-warning">
            ⚠️ Трудозатраты этапа ({{ Math.round(autoLevelTotalEffort) }} ч) выше доступной емкости
            команды ({{ Math.round(autoLevelTeamCapacityHours) }} ч).
            <template v-if="autoLevelEmployeeCount <= 1">
              Нужно добавить еще сотрудника (минимум до {{ autoLevelRequiredEmployees }}), иначе будет
              повышенная нагрузка и задачи выйдут за сроки этапа.
            </template>
            <template v-else>
              Добавьте сотрудников (рекомендуется минимум {{ autoLevelRequiredEmployees }}), либо ожидайте
              повышенную нагрузку и выход за сроки этапа.
            </template>
          </div>
          <div v-else-if="autoLevelDistributionMode === 'duration' && autoLevelDurationHasOverload" class="auto-level-warning">
            ⚠️ Трудозатраты этапа ({{ Math.round(autoLevelTotalEffort) }} ч) выше доступной емкости
            команды за {{ autoLevelStageWorkingDays }} рабочих дней
            ({{ Math.round(autoLevelDurationTeamCapacityHours) }} ч).
            <template v-if="autoLevelEmployeeCount <= 1">
              Нужно добавить еще сотрудника (минимум до {{ autoLevelDurationRequiredEmployees }}), иначе будет
              повышенная нагрузка и задачи выйдут за сроки этапа.
            </template>
            <template v-else>
              Добавьте сотрудников (рекомендуется минимум {{ autoLevelDurationRequiredEmployees }}), либо ожидайте
              повышенную нагрузку и выход за сроки этапа.
            </template>
          </div>
        </div>
        <div class="auto-level-modal__actions">
          <button class="btn btn-small btn-ghost" type="button" @click="closeAutoLevelModal">Отмена</button>
          <button class="btn btn-small" type="button" :disabled="isLevelingResources || isUndoLevelingResources" @click="applyAutoLevelResources">
            {{ isLevelingResources ? 'Применение…' : 'Применить' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, inject, unref } from 'vue'
import TaskCardModal from '@/components/common/TaskCardModal.vue'
import {
  normalizePredecessorIds,
  getTaskDependencyLinks,
  normalizeDependencyType,
  normalizeLagDays
} from '@/utils/taskModel'
import { applyReplacePredecessor, applyMoveSuccessor, applyAddPredecessor } from '@/utils/ganttDependencies'
import { useBlocks } from '@/composables/useBlocks'
import { useGantt } from '@/composables/useGantt'
import { useTasks } from '@/composables/useTasks'
import { useNotification } from '@/composables/useNotification'
import linkIcon from '@/assets/link-icon.png'

// Gantt-экран: таймлайн этапов/задач, зависимости, критический путь и ресурсные инструменты.
const { blocks, updateBlock, getTaskProgress, blockHasTaskInProgress } = useBlocks()
const { showNotificationMessage } = useNotification()
const {
  cycleTaskStatus,
  onTaskDragStart,
  onTaskDragEnd,
  onTaskDragOver,
  onTaskDragEnter,
  onTaskDragLeave,
  onTaskDrop,
  draggedTask,
  dragOverTask,
  dragOverBlock,
  getStatusTitle,
  saveTaskCard,
  deleteTask
} = useTasks()

const isTaskDragOver = (block, task) =>
  dragOverBlock.value?.id === block.id && dragOverTask.value?.id === task.id
const {
  dayWidth,
  totalTimelineWidth,
  isOverdue,
  getGanttStatus,
  getGanttStatusLabel,
  filteredGanttBlocks,
  zoomIn,
  zoomOut,
  resetZoom,
  ganttRiskOnly,
  scaleMode,
  ticks,
  visibleRange,
  startDrag,
  getBarStyleWithPreview,
  setScaleMode,
  getDayOffsetX,
  dragging,
  dragPreview,
} = useGantt({
  onStageCommitted: ({ blockId, prevStartDate, prevReleaseDate }) => {
    // Сохраняем состояние "до" последнего ручного изменения этапа (drag/resize).
    lastManualGanttEditSnapshot.value = {
      type: 'stage',
      at: Date.now(),
      blockId,
      prevStartDate,
      prevReleaseDate
    }
  }
})

const readOnlyInjected = inject('readOnly', computed(() => false))
const readOnly = computed(() => Boolean(unref(readOnlyInjected)))

const capitalizeFirstLetter = (text) => {
  if (typeof text !== 'string' || !text.length) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const headerTicks = computed(() => {
  const list = ticks.value || []
  return list.map((tick) => ({
    ...tick,
    label: capitalizeFirstLetter(tick.label)
  }))
})

const getIsoWeekNumber = (dateLike) => {
  const d = startOfLocalDay(dateLike)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day + 3) // четверг текущей ISO-недели
  const isoYear = d.getFullYear()
  const jan4 = new Date(isoYear, 0, 4)
  const jan4Day = (jan4.getDay() + 6) % 7
  const week1Monday = new Date(jan4)
  week1Monday.setDate(jan4.getDate() - jan4Day)
  const week = Math.floor(dayDiffLocal(week1Monday, d) / 7) + 1
  return { year: isoYear, week }
}

const dayScaleDayMeta = computed(() => {
  const out = []
  const start = startOfLocalDay(visibleRange.value.start)
  for (let i = 0; i < visibleRange.value.days; i += 1) {
    const date = addDaysLocal(start, i)
    const year = date.getFullYear()
    const month = date.getMonth()
    const isoWeek = getIsoWeekNumber(date)
    const dayNumber = String(date.getDate())
    out.push({
      key: `d-${i}`,
      left: i * dayWidth.value,
      width: dayWidth.value,
      dayLabel: dayNumber,
      weekKey: `${isoWeek.year}-${isoWeek.week}`,
      weekLabel: `Неделя ${isoWeek.week}`,
      monthKey: `${year}-${month}`,
      monthLabel: capitalizeFirstLetter(date.toLocaleDateString('ru-RU', { month: 'long' }))
    })
  }
  return out
})

const mergeHeaderBands = (list, keyField, labelField, keyPrefix) => {
  if (!list.length) return []
  const out = []
  let startIdx = 0
  while (startIdx < list.length) {
    const baseKey = list[startIdx][keyField]
    let endIdx = startIdx
    while (endIdx + 1 < list.length && list[endIdx + 1][keyField] === baseKey) {
      endIdx += 1
    }
    const startCell = list[startIdx]
    const endCell = list[endIdx]
    out.push({
      key: `${keyPrefix}-${baseKey}-${startIdx}`,
      left: startCell.left,
      width: (endCell.left + endCell.width) - startCell.left,
      label: startCell[labelField]
    })
    startIdx = endIdx + 1
  }
  return out
}

const dayScaleMonthCells = computed(() =>
  mergeHeaderBands(dayScaleDayMeta.value, 'monthKey', 'monthLabel', 'month')
)

const dayScaleWeekCells = computed(() =>
  mergeHeaderBands(dayScaleDayMeta.value, 'weekKey', 'weekLabel', 'week')
)

const dayScaleDayCells = computed(() =>
  dayScaleDayMeta.value.map((cell) => ({
    key: `day-${cell.key}`,
    left: cell.left,
    width: cell.width,
    label: cell.dayLabel
  }))
)

const EDGE_RESIZE_HIT_PX = 12

const resolveBarDragMode = (mode, e) => {
  if (mode !== 'move') return mode
  const el = e?.currentTarget
  if (!el || typeof el.getBoundingClientRect !== 'function') return mode
  const rect = el.getBoundingClientRect()
  if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) return mode
  // Для узких баров оставляем только move по телу,
  // иначе зона "краев" съедает весь бар и сдвиг этапа не срабатывает.
  if (rect.width <= EDGE_RESIZE_HIT_PX * 3) return mode
  const edgeHitPx = Math.min(EDGE_RESIZE_HIT_PX, Math.floor(rect.width / 4))
  const offsetX = e.clientX - rect.left
  if (offsetX <= edgeHitPx) return 'resize-left'
  if (offsetX >= rect.width - edgeHitPx) return 'resize-right'
  return mode
}

const onBarMouseDown = (block, mode, e) => {
  if (readOnly.value) return
  const resolvedMode = resolveBarDragMode(mode, e)
  startDrag(block, resolvedMode, e)
}
const tryCycleTaskStatus = (block, task, ev) => {
  if (readOnly.value) return
  cycleTaskStatus(block, task, ev)
}

const taskCardModalOpen = ref(false)
const taskCardBlock = ref(null)
const taskCardTask = ref(null)

const openTaskCardModal = (block, task) => {
  if (readOnly.value) return
  taskCardBlock.value = block
  taskCardTask.value = task
  taskCardModalOpen.value = true
}

const closeTaskCardModal = () => {
  taskCardModalOpen.value = false
  taskCardBlock.value = null
  taskCardTask.value = null
}

const saveTaskCardModal = async (patch) => {
  if (!taskCardBlock.value || !taskCardTask.value) return
  const res = await saveTaskCard(taskCardBlock.value, taskCardTask.value, patch)
  if (res?.success) closeTaskCardModal()
}

const deleteTaskCardModal = async () => {
  if (!taskCardBlock.value || !taskCardTask.value) return
  const res = await deleteTask(taskCardBlock.value, taskCardTask.value)
  if (res?.success) closeTaskCardModal()
}

const normalizeLinkUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const openTaskLink = (task) => {
  const url = normalizeLinkUrl(task?.linkUrl || '')
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

const normalizeDatePair = (startDate, releaseDate, changedField) => {
  let start = startDate || ''
  let end = releaseDate || ''
  if (start && end && start > end) {
    if (changedField === 'startDate') end = start
    else start = end
  }
  return { startDate: start, releaseDate: end }
}

const onStageDateInputChange = async (block, field, nextRawValue) => {
  if (readOnly.value) return
  if (!block?.id) return
  if (field !== 'startDate' && field !== 'releaseDate') return
  const nextValue = typeof nextRawValue === 'string' ? nextRawValue : ''
  const currentValue = field === 'startDate' ? (block.startDate || '') : (block.releaseDate || '')
  if (nextValue === currentValue) return

  const normalized = normalizeDatePair(
    field === 'startDate' ? nextValue : (block.startDate || ''),
    field === 'releaseDate' ? nextValue : (block.releaseDate || ''),
    field
  )
  const updated = {
    ...block,
    startDate: normalized.startDate,
    releaseDate: normalized.releaseDate
  }
  // Сохраняем состояние для отмены последнего ручного изменения этапа.
  lastManualGanttEditSnapshot.value = {
    type: 'stage',
    at: Date.now(),
    blockId: String(block.id),
    prevStartDate: String(block.startDate || ''),
    prevReleaseDate: String(block.releaseDate || '')
  }
  const res = await updateBlock(updated)
  if (!res?.success) {
    lastManualGanttEditSnapshot.value = null
    showNotificationMessage('Не удалось сохранить даты этапа', 'error')
  }
}

const onTaskDateInputChange = async (block, task, field, nextRawValue) => {
  if (readOnly.value) return
  if (!block?.id || !task) return
  if (field !== 'startDate' && field !== 'releaseDate') return

  const nextValue = typeof nextRawValue === 'string' ? nextRawValue : ''
  const currentValue = field === 'startDate' ? (task.startDate || '') : (task.releaseDate || '')
  if (nextValue === currentValue) return

  const taskIndex = (block.tasks || []).findIndex((t) =>
    (task?.id && t?.id && String(t.id) === String(task.id)) || t === task
  )
  if (taskIndex < 0) return

  const sourceTask = block.tasks[taskIndex] || {}
  const normalized = normalizeDatePair(
    field === 'startDate' ? nextValue : (sourceTask.startDate || ''),
    field === 'releaseDate' ? nextValue : (sourceTask.releaseDate || ''),
    field
  )
  const tasksDraft = (block.tasks || []).map((t, idx) => (idx === taskIndex
    ? { ...t, startDate: normalized.startDate, releaseDate: normalized.releaseDate }
    : t
  ))
  // Сохраняем состояние для отмены последнего ручного изменения дат задач.
  // Важно: при FS-зависимостях пересчитываются и другие задачи — поэтому снимок делаем по всему этапу.
  lastManualGanttEditSnapshot.value = {
    type: 'task',
    at: Date.now(),
    blockId: String(block.id),
    tasks: (block.tasks || [])
      .filter((t) => t?.id !== null && t?.id !== undefined && String(t.id).trim() !== '')
      .map((t) => ({
        taskId: String(t.id),
        startDate: String(t.startDate || ''),
        releaseDate: String(t.releaseDate || '')
      }))
  }
  const tasks = enforceFsDependencySchedule(tasksDraft, sourceTask?.id)
  const updated = { ...block, tasks }
  const res = await updateBlock(updated)
  if (!res?.success) {
    lastManualGanttEditSnapshot.value = null
    showNotificationMessage('Не удалось сохранить даты задачи', 'error')
  }
}

const hoveredRowId = ref(null)
const showCriticalPath = ref(false)
const isLevelingResources = ref(false)
const isUndoLevelingResources = ref(false)
const levelingSnapshot = ref(null)
const isUndoLastManualGanttEdit = ref(false)
const lastManualGanttEditSnapshot = ref(null)
const autoLevelModalOpen = ref(false)
const autoLevelSelectedBlockId = ref('')
const autoLevelSelectedBlockIds = ref([])
const autoLevelEmployeeCount = ref(1)
const autoLevelIncludeWeekends = ref(false)
const autoLevelCreateLinks = ref(true)
const autoLevelTotalEffort = ref(40)
const autoLevelDistributionMode = ref('effort') // 'effort' | 'duration'
const hoveredTaskRef = ref(null)
const AUTO_LEVEL_MONTHLY_HOURS_PER_EMPLOYEE = 120

const onTaskBarEnter = (block, task) => {
  const taskId = task?.id
  if (taskId === null || taskId === undefined || taskId === '') {
    hoveredTaskRef.value = null
    return
  }
  hoveredTaskRef.value = { blockId: String(block?.id), taskId: String(taskId) }
}

const onTaskBarLeave = () => {
  hoveredTaskRef.value = null
}

const isTaskDepHighlighted = (seg) => {
  const hovered = hoveredTaskRef.value
  if (!hovered) return false
  return (
    (String(seg.predBlockId || '') === hovered.blockId && String(seg.predId) === hovered.taskId) ||
    (String(seg.blockId || '') === hovered.blockId && String(seg.succId) === hovered.taskId)
  )
}

const sidebarTasks = ref(null)
const timelineTasks = ref(null)
const ganttTimelinePanel = ref(null)
const scrollSyncLock = ref(false)

/** Вертикальный скролл списка таймлайна (для пересчёта слоя зависимостей по кадрам). */
const timelineScrollTop = ref(0)
/** Горизонтальный скролл панели Ганта. */
const ganttPanelScrollLeft = ref(0)

const expandedBlockIds = ref(new Set())
const getBlockExpandKey = (blockId) => String(blockId)
const isBlockExpanded = (blockId) => expandedBlockIds.value.has(getBlockExpandKey(blockId))
const visibleBlockExpandKeys = computed(() =>
  (filteredGanttBlocks.value || []).map((b) => getBlockExpandKey(b.id))
)
const allVisibleStagesExpanded = computed(() => {
  const keys = visibleBlockExpandKeys.value
  if (!keys.length) return false
  return keys.every((key) => expandedBlockIds.value.has(key))
})

const toggleExpanded = (blockId) => {
  const key = getBlockExpandKey(blockId)
  const next = new Set(expandedBlockIds.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedBlockIds.value = next
}

const toggleAllVisibleStagesExpanded = () => {
  const keys = visibleBlockExpandKeys.value
  if (!keys.length) return
  const next = new Set(expandedBlockIds.value)
  if (allVisibleStagesExpanded.value) {
    keys.forEach((key) => next.delete(key))
  } else {
    keys.forEach((key) => next.add(key))
  }
  expandedBlockIds.value = next
}

/** Мета в сайдбаре: без «в графике» — только риск/просрочка и отклонение от плана. */
const ganttSidebarMeta = (block) => {
  const status = getGanttStatus(block)
  const parts = []
  if (status === 'risk' || status === 'delayed') {
    parts.push(getGanttStatusLabel(block))
  }
  return parts.length ? parts.join(' · ') : ''
}

/** Высота строки этапа (сайдбар + таймлайн). */
const STAGE_ROW_HEIGHT = 54
/** Строка подзадачи на таймлайне. */
const TASK_ROW_HEIGHT = 46

const parseIsoDateLocal = (dateLike) => {
  if (!dateLike || typeof dateLike !== 'string') return null
  const trimmed = dateLike.trim()
  if (!trimmed) return null
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mon = Number(m[2]) - 1
  const d = Number(m[3])
  const date = new Date(y, mon, d)
  return Number.isNaN(date.getTime()) ? null : date
}

const startOfLocalDay = (dateObj) =>
  new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())

const dayDiffLocal = (from, to) => {
  const DAY_MS = 24 * 60 * 60 * 1000
  return Math.floor((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / DAY_MS)
}

const toIsoDateLocal = (dateObj) => {
  const date = startOfLocalDay(dateObj)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const addDaysLocal = (dateLike, days) => {
  const date = startOfLocalDay(dateLike)
  date.setDate(date.getDate() + Number(days || 0))
  return date
}

const WORK_HOURS_PER_DAY = 8
const AUTO_LEVEL_WORK_HOURS_PER_EMPLOYEE = 5

const getTaskEffortHours = (task) => {
  const effort = Number(task?.effort)
  if (!Number.isFinite(effort) || effort <= 0) return 1
  return effort
}

const isWeekendDay = (dateObj) => {
  const day = dateObj.getDay()
  return day === 0 || day === 6
}

const isWorkingDate = (dateObj, includeWeekends) => {
  if (includeWeekends) return true
  return !isWeekendDay(dateObj) && !isRussianHoliday(dateObj)
}

const nextWorkingDate = (dateObj, includeWeekends) => {
  const cursor = startOfLocalDay(dateObj)
  while (!isWorkingDate(cursor, includeWeekends)) {
    cursor.setDate(cursor.getDate() + 1)
  }
  return cursor
}

const addScheduleDaysInclusive = (startDateObj, durationDays, includeWeekends) => {
  let remaining = Math.max(1, Math.floor(Number(durationDays) || 1))
  let cursor = nextWorkingDate(startDateObj, includeWeekends)
  while (remaining > 1) {
    cursor = addDaysLocal(cursor, 1)
    if (!isWorkingDate(cursor, includeWeekends)) continue
    remaining -= 1
  }
  return cursor
}

const collectFsSuccessorIds = (tasks, rootTaskId) => {
  const rootKey = rootTaskId !== null && rootTaskId !== undefined && rootTaskId !== '' ? String(rootTaskId) : ''
  if (!rootKey) return new Set()
  const visited = new Set([rootKey])
  const queue = [rootKey]
  const successors = new Set()
  while (queue.length) {
    const predId = queue.shift()
    for (const task of tasks) {
      const taskId = task?.id !== null && task?.id !== undefined && task?.id !== '' ? String(task.id) : ''
      if (!taskId || visited.has(taskId)) continue
      const hasFsFromPred = getTaskDependencyLinks(task).some((link) =>
        normalizeDependencyType(link.type) === 'FS' && String(link.predId) === predId
      )
      if (!hasFsFromPred) continue
      visited.add(taskId)
      successors.add(taskId)
      queue.push(taskId)
    }
  }
  return successors
}

const enforceFsDependencySchedule = (tasksInput, rootTaskId) => {
  const tasks = Array.isArray(tasksInput) ? tasksInput.map((task) => ({ ...task })) : []
  if (tasks.length < 2) return tasks
  const successors = collectFsSuccessorIds(tasks, rootTaskId)
  if (!successors.size) return tasks
  const idToIndex = new Map()
  tasks.forEach((task, idx) => {
    if (task?.id !== null && task?.id !== undefined && task?.id !== '') {
      idToIndex.set(String(task.id), idx)
    }
  })
  const maxPasses = tasks.length * 2
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false
    for (let idx = 0; idx < tasks.length; idx += 1) {
      const succTask = tasks[idx]
      const succKey = succTask?.id !== null && succTask?.id !== undefined && succTask?.id !== '' ? String(succTask.id) : ''
      if (!succKey || !successors.has(succKey)) continue
      const links = getTaskDependencyLinks(succTask)
      if (!links.length) continue
      const succStartRaw = parseIsoDateLocal(succTask?.startDate) || parseIsoDateLocal(succTask?.releaseDate)
      const succEndRaw = parseIsoDateLocal(succTask?.releaseDate) || parseIsoDateLocal(succTask?.startDate)
      if (!succStartRaw || !succEndRaw) continue
      const succStart = succStartRaw <= succEndRaw ? succStartRaw : succEndRaw
      const succEnd = succStartRaw <= succEndRaw ? succEndRaw : succStartRaw
      const spanDays = Math.max(1, dayDiffLocal(succStart, succEnd) + 1)
      let requiredStart = null
      for (const link of links) {
        if (normalizeDependencyType(link.type) !== 'FS') continue
        const predIdx = idToIndex.get(String(link.predId))
        if (!Number.isInteger(predIdx)) continue
        const predTask = tasks[predIdx]
        const predEnd = parseIsoDateLocal(predTask?.releaseDate) || parseIsoDateLocal(predTask?.startDate)
        if (!predEnd) continue
        const lagDays = normalizeLagDays(link.lagDays)
        const candidate = nextWorkingDate(addDaysLocal(predEnd, lagDays + 1), false)
        if (!requiredStart || candidate.getTime() > requiredStart.getTime()) requiredStart = candidate
      }
      if (!requiredStart) continue
      if (requiredStart.getTime() === succStart.getTime()) continue
      const nextStart = requiredStart
      const nextEnd = addDaysLocal(nextStart, spanDays - 1)
      tasks[idx] = {
        ...succTask,
        startDate: toIsoDateLocal(nextStart),
        releaseDate: toIsoDateLocal(nextEnd)
      }
      changed = true
    }
    if (!changed) break
  }
  return tasks
}

const getBlockTotalEffortHours = (block) => {
  const blockEffort = Number(block?.effort)
  if (Number.isFinite(blockEffort) && blockEffort > 0) return blockEffort
  const taskEffortSum = (block?.tasks || []).reduce((sum, task) => sum + getTaskEffortHours(task), 0)
  return Math.max(1, taskEffortSum)
}

const getTaskDurationDays = (task, blockStart) => {
  const rawStart = parseIsoDateLocal(task?.startDate)
  const rawEnd = parseIsoDateLocal(task?.releaseDate)
  if (!rawStart && !rawEnd) return 1
  const start = rawStart || rawEnd || blockStart
  const end = rawEnd || rawStart || start
  if (!start || !end) return 1
  return Math.max(1, dayDiffLocal(start, end) + 1)
}

const getTaskResourceKey = (task, block) => {
  const candidates = [
    task?.resourceId,
    task?.resource,
    task?.assignee,
    task?.assigneeUsername,
    task?.ownerUsername,
    block?.ownerUsername
  ]
  for (const value of candidates) {
    const normalized = String(value || '').trim()
    if (normalized) return normalized.toLowerCase()
  }
  return '__default_resource__'
}

const TASK_BAR_DRAG_THRESHOLD_PX = 3
const taskBarDrag = ref(null)

const buildTaskBarDragMatch = (block, task, taskIdx) => ({
  blockKey: String(block?.id),
  taskKey: task?.id === null || task?.id === undefined ? null : String(task.id),
  fallbackIndex: Number(taskIdx)
})

const doesTaskBarDragMatch = (drag, block, task, taskIdx) => {
  if (!drag || !block || !task) return false
  if (String(block.id) !== drag.blockKey) return false
  if (drag.taskKey !== null) return String(task.id) === drag.taskKey
  return Number(taskIdx) === drag.fallbackIndex
}

const isTaskBarDragging = (block, task, taskIdx) =>
  doesTaskBarDragMatch(taskBarDrag.value, block, task, taskIdx)

const taskBarDragShiftDays = (deltaPx) => {
  if (!Number.isFinite(deltaPx)) return 0
  const absPx = Math.abs(deltaPx)
  if (absPx < TASK_BAR_DRAG_THRESHOLD_PX) return 0
  const sign = deltaPx < 0 ? -1 : 1
  const roundedDays = Math.round(absPx / dayWidth.value)
  return sign * Math.max(1, roundedDays)
}

const detachTaskBarDragListeners = () => {
  window.removeEventListener('mousemove', onTaskBarDragMove)
  window.removeEventListener('mouseup', onTaskBarDragUp)
}

const clearTaskBarDragState = () => {
  detachTaskBarDragListeners()
  document.body.classList.remove('is-dragging')
  taskBarDrag.value = null
}

function onTaskBarDragMove(e) {
  const drag = taskBarDrag.value
  if (!drag) return
  const deltaPx = e.clientX - drag.startX
  const shiftDays = taskBarDragShiftDays(deltaPx)
  const baseStart = parseIsoDateLocal(drag.startDateIso)
  const baseEnd = parseIsoDateLocal(drag.endDateIso)
  if (!baseStart || !baseEnd) return
  let nextStart = baseStart
  let nextEnd = baseEnd

  if (drag.mode === 'move') {
    nextStart = addDaysLocal(baseStart, shiftDays)
    nextEnd = addDaysLocal(baseEnd, shiftDays)
  } else if (drag.mode === 'resize-left') {
    nextStart = addDaysLocal(baseStart, shiftDays)
    if (nextStart > baseEnd) nextStart = baseEnd
  } else if (drag.mode === 'resize-right') {
    nextEnd = addDaysLocal(baseEnd, shiftDays)
    if (nextEnd < baseStart) nextEnd = baseStart
  }

  taskBarDrag.value = {
    ...drag,
    deltaPx,
    shiftDays,
    previewStartIso: toIsoDateLocal(nextStart),
    previewEndIso: toIsoDateLocal(nextEnd),
    previewLeftPx: drag.mode === 'move' ? drag.startLeftPx + deltaPx : null
  }
}

const findDraggedTaskIndex = (block, drag) => {
  const tasks = block?.tasks || []
  if (!tasks.length) return -1
  if (drag.taskKey !== null) {
    const byId = tasks.findIndex((t) => String(t?.id) === drag.taskKey)
    if (byId >= 0) return byId
  }
  const sorted = getSortedBlockTasks(block)
  const bySortedIdx = sorted[drag.fallbackIndex]
  if (bySortedIdx?.id !== null && bySortedIdx?.id !== undefined) {
    return tasks.findIndex((t) => String(t?.id) === String(bySortedIdx.id))
  }
  return tasks.findIndex((t) => t === bySortedIdx)
}

async function onTaskBarDragUp() {
  const drag = taskBarDrag.value
  if (!drag) return
  clearTaskBarDragState()
  const nextStart = drag.previewStartIso || drag.startDateIso
  const nextEnd = drag.previewEndIso || drag.endDateIso
  if (nextStart === drag.startDateIso && nextEnd === drag.endDateIso) return

  const block = blocks.value.find((b) => String(b.id) === drag.blockKey)
  if (!block) return
  const taskIdx = findDraggedTaskIndex(block, drag)
  if (taskIdx < 0) return

  const sourceTask = block.tasks?.[taskIdx]
  if (!sourceTask) return
  if ((sourceTask.startDate || '') === nextStart && (sourceTask.releaseDate || '') === nextEnd) return

  // Сохраняем состояние этапа до ручного изменения задач (move/resize).
  // При FS-зависимостях может пересчитываться множество задач, поэтому снимок делаем для всего этапа.
  lastManualGanttEditSnapshot.value = {
    type: 'task',
    at: Date.now(),
    blockId: String(block.id),
    tasks: (block.tasks || [])
      .filter((t) => t?.id !== null && t?.id !== undefined && String(t.id).trim() !== '')
      .map((t) => ({
        taskId: String(t.id),
        startDate: String(t.startDate || ''),
        releaseDate: String(t.releaseDate || '')
      }))
  }

  const tasksDraft = (block.tasks || []).map((t, idx) =>
    idx === taskIdx ? { ...t, startDate: nextStart, releaseDate: nextEnd } : t
  )
  const tasks = enforceFsDependencySchedule(tasksDraft, sourceTask?.id)
  const res = await updateBlock({ ...block, tasks })
  if (!res?.success) {
    lastManualGanttEditSnapshot.value = null
    showNotificationMessage('Не удалось сохранить даты задачи', 'error')
  }
}

const onTaskBarMouseDown = (block, task, taskIdx, e, modeHint = 'move') => {
  if (readOnly.value) return
  if (e?.button !== 0) return
  const baseStart =
    parseIsoDateLocal(task?.startDate) ||
    parseIsoDateLocal(task?.releaseDate) ||
    parseIsoDateLocal(block?.startDate) ||
    parseIsoDateLocal(block?.releaseDate)
  const baseEnd =
    parseIsoDateLocal(task?.releaseDate) ||
    parseIsoDateLocal(task?.startDate) ||
    parseIsoDateLocal(block?.startDate) ||
    parseIsoDateLocal(block?.releaseDate)
  if (!baseStart || !baseEnd) return

  const orderedStart = baseStart <= baseEnd ? baseStart : baseEnd
  const orderedEnd = baseStart <= baseEnd ? baseEnd : baseStart
  const layout = getTaskBarLayout(block, taskIdx)
  if (!layout) return

  clearTaskBarDragState()
  const match = buildTaskBarDragMatch(block, task, taskIdx)
  taskBarDrag.value = {
    ...match,
    mode: modeHint || 'move',
    startX: e.clientX,
    deltaPx: 0,
    shiftDays: 0,
    startLeftPx: layout.left,
    widthPx: layout.width,
    startDateIso: toIsoDateLocal(orderedStart),
    endDateIso: toIsoDateLocal(orderedEnd),
    previewStartIso: toIsoDateLocal(orderedStart),
    previewEndIso: toIsoDateLocal(orderedEnd),
    previewLeftPx: layout.left
  }
  document.body.classList.add('is-dragging')
  window.addEventListener('mousemove', onTaskBarDragMove)
  window.addEventListener('mouseup', onTaskBarDragUp)
}

const findDraggedTaskSortedIndex = (block, drag) => {
  if (!block || !drag) return -1
  const sorted = getSortedBlockTasks(block)
  if (!sorted.length) return -1
  if (drag.taskKey !== null) {
    const byId = sorted.findIndex((t) => String(t?.id) === drag.taskKey)
    if (byId >= 0) return byId
  }
  const fallback = Number.isFinite(drag.fallbackIndex) ? drag.fallbackIndex : 0
  return Math.max(0, Math.min(sorted.length - 1, fallback))
}

const getStageWrapperHeight = (block) => {
  const tasksCount = block?.tasks?.length || 0
  if (!isBlockExpanded(block.id)) return STAGE_ROW_HEIGHT
  return STAGE_ROW_HEIGHT + tasksCount * TASK_ROW_HEIGHT
}

const dragDateTooltip = computed(() => {
  const taskDrag = taskBarDrag.value
  if (taskDrag) {
    return null
  }

  const drag = dragging.value
  const preview = dragPreview.value
  if (!drag || !preview) return null
  const active = filteredGanttBlocks.value.find((b) => String(b.id) === String(drag.blockId))
  if (!active) return null

  let rowOffset = 0
  for (const block of filteredGanttBlocks.value) {
    if (String(block.id) === String(drag.blockId)) break
    rowOffset += getStageWrapperHeight(block)
  }

  const stageStyle = getBarStyleWithPreview(active) || {}
  const left = typeof stageStyle.left === 'string' ? parseFloat(stageStyle.left) : NaN
  const width = typeof stageStyle.width === 'string' ? parseFloat(stageStyle.width) : NaN
  if (!Number.isFinite(left) || !Number.isFinite(width)) return null

  const startLabel = formatDate(preview.startDate)
  const endLabel = formatDate(preview.endDate)
  let text = `Старт: ${startLabel} · Финиш: ${endLabel}`
  if (drag.mode === 'resize-left') text = `Новая дата начала: ${startLabel}`
  if (drag.mode === 'resize-right') text = `Новая дата окончания: ${endLabel}`

  return {
    text,
    left: Math.max(8, left + width / 2),
    // Держим подсказку на уровне линии этапа, чтобы у первой строки
    // она не уходила за верх панели из-за отрицательного Y.
    top: rowOffset + Math.floor(STAGE_ROW_HEIGHT / 2)
  }
})

const getTaskDragInlineLabel = (block, task, taskIdx) => {
  if (!isTaskBarDragging(block, task, taskIdx)) return ''
  const drag = taskBarDrag.value
  if (!drag) return ''
  const startLabel = formatDate(drag.previewStartIso || drag.startDateIso)
  const endLabel = formatDate(drag.previewEndIso || drag.endDateIso)
  return `Старт: ${startLabel} · Финиш: ${endLabel}`
}

const onSidebarScroll = (e) => {
  const sourceEl = e?.target || sidebarTasks.value
  if (sourceEl) timelineScrollTop.value = sourceEl.scrollTop
  if (scrollSyncLock.value) return
  if (!timelineTasks.value) return
  if (!sourceEl) return
  scrollSyncLock.value = true
  timelineTasks.value.scrollTop = sourceEl.scrollTop
  requestAnimationFrame(() => {
    scrollSyncLock.value = false
  })
}

const onTimelineScroll = (e) => {
  const targetEl = e?.target
  if (targetEl) timelineScrollTop.value = targetEl.scrollTop
  if (scrollSyncLock.value) return
  if (!sidebarTasks.value) return
  if (!targetEl) return
  scrollSyncLock.value = true
  sidebarTasks.value.scrollTop = targetEl.scrollTop
  requestAnimationFrame(() => {
    scrollSyncLock.value = false
  })
}

const onGanttTimelinePanelScroll = (e) => {
  const el = e?.target
  if (el) ganttPanelScrollLeft.value = el.scrollLeft
}

const todayOffsetDays = computed(() => {
  const x = getDayOffsetX(new Date())
  return Math.round(x / dayWidth.value)
})

const RU_FIXED_HOLIDAYS = new Set([
  '01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08',
  '02-23',
  '03-08',
  '05-01',
  '05-09',
  '06-12',
  '11-04'
])

const isRussianHoliday = (dateObj) => {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return false
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0')
  const dd = String(dateObj.getDate()).padStart(2, '0')
  return RU_FIXED_HOLIDAYS.has(`${mm}-${dd}`)
}

const calendarHighlightedDays = computed(() => {
  const start = startOfLocalDay(visibleRange.value.start)
  const out = []
  for (let i = 0; i < visibleRange.value.days; i += 1) {
    const date = addDaysLocal(start, i)
    const dow = date.getDay()
    const isWeekend = dow === 0 || dow === 6
    const isHoliday = isRussianHoliday(date)
    if (!isWeekend && !isHoliday) continue
    out.push({
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      left: i * dayWidth.value,
      isWeekend,
      isHoliday
    })
  }
  return out
})

const monthDividers = computed(() => {
  const start = startOfLocalDay(visibleRange.value.start)
  const out = []
  for (let i = 0; i < visibleRange.value.days; i += 1) {
    const date = addDaysLocal(start, i)
    if (date.getDate() !== 1) continue
    if (i === 0) continue
    out.push({
      key: `${date.getFullYear()}-${date.getMonth() + 1}`,
      left: i * dayWidth.value
    })
  }
  return out
})

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

const getTasksByOrder = (block) => {
  const tasks = block?.tasks || []
  return [...tasks].sort((a, b) => (a.order || 0) - (b.order || 0))
}

const getSortedBlockTasks = (block) => {
  const tasks = getTasksByOrder(block)
  if (!showCriticalPath.value) return tasks

  const blockData = criticalPathByBlock.value.get(block?.id)
  if (!blockData) return tasks

  const criticalTaskKeys = blockData.criticalTaskKeys || new Set()
  const taskScoreByKey = blockData.taskScoreByKey || new Map()
  const taskLinkCountByKey = blockData.taskLinkCountByKey || new Map()

  const items = tasks.map((task, idx) => {
    const key = getCriticalTaskKey(task, idx)
    return {
      task,
      idx,
      key,
      linkCount: taskLinkCountByKey.get(key) || 0,
      isCritical: criticalTaskKeys.has(key),
      score: taskScoreByKey.get(key) || 0
    }
  })

  const itemByKey = new Map(items.map((item) => [item.key, item]))
  const succ = new Map(items.map((item) => [item.key, []]))
  const indeg = new Map(items.map((item) => [item.key, 0]))
  const idToKey = new Map()
  tasks.forEach((task, idx) => {
    if (task?.id !== null && task?.id !== undefined && task?.id !== '') {
      idToKey.set(String(task.id), getCriticalTaskKey(task, idx))
    }
  })

  tasks.forEach((task, idx) => {
    const toKey = getCriticalTaskKey(task, idx)
    for (const dep of getTaskDependencyLinks(task)) {
      const fromKey = idToKey.get(String(dep.predId))
      if (!fromKey || fromKey === toKey) continue
      succ.get(fromKey)?.push(toKey)
      indeg.set(toKey, (indeg.get(toKey) || 0) + 1)
    }
  })

  const compareItems = (a, b) => {
    if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1
    if (a.score !== b.score) return b.score - a.score
    return a.idx - b.idx
  }

  const linkedItems = items.filter((item) => item.linkCount > 0)
  const unlinkedItems = items.filter((item) => item.linkCount <= 0).sort((a, b) => a.idx - b.idx)
  const visited = new Set()
  const ordered = []

  const visitChain = (startKey) => {
    const stack = [startKey]
    while (stack.length) {
      const key = stack.pop()
      if (visited.has(key)) continue
      visited.add(key)
      const item = itemByKey.get(key)
      if (!item || item.linkCount <= 0) continue
      ordered.push(item)
      const children = (succ.get(key) || [])
        .map((k) => itemByKey.get(k))
        .filter(Boolean)
        .sort(compareItems)
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i].key)
      }
    }
  }

  // Корни связанных цепочек — сначала: от них сразу идут зависимые задачи.
  linkedItems
    .filter((item) => (indeg.get(item.key) || 0) === 0)
    .sort(compareItems)
    .forEach((item) => visitChain(item.key))

  // Остаток связанных (например, при циклах) тоже добавляем, чтобы ничего не терялось.
  linkedItems
    .sort(compareItems)
    .forEach((item) => visitChain(item.key))

  return [...ordered.map((item) => item.task), ...unlinkedItems.map((item) => item.task)]
}

const createLevelingSnapshot = () => ({
  at: Date.now(),
  blocks: (blocks.value || []).map((block) => ({
    blockId: String(block.id),
    tasks: (block.tasks || []).map((task) => ({
      taskId: task?.id === null || task?.id === undefined ? null : String(task.id),
      startDate: String(task?.startDate || ''),
      releaseDate: String(task?.releaseDate || ''),
      effort: Number(task?.effort || 0),
      predecessorIds: normalizePredecessorIds(task?.predecessorIds),
      predecessorLinks: getTaskDependencyLinks(task)
    }))
  }))
})

const autoLevelExpandedBlocks = computed(() =>
  (filteredGanttBlocks.value || []).filter((block) => isBlockExpanded(block.id))
)

const openAutoLevelModal = () => {
  if (readOnly.value || isLevelingResources.value) return
  const expanded = autoLevelExpandedBlocks.value
  if (!expanded.length) {
    showNotificationMessage('⚖️ Разверните этап, чтобы открыть автораспределение', 'warning')
    return
  }
  const first = expanded[0]
  autoLevelSelectedBlockId.value = String(first.id)
  autoLevelSelectedBlockIds.value = [String(first.id)]
  autoLevelTotalEffort.value = Math.max(1, Math.round(getBlockTotalEffortHours(first)))
  autoLevelEmployeeCount.value = Math.max(1, Math.floor(Number(autoLevelEmployeeCount.value) || 1))
  autoLevelIncludeWeekends.value = false
  autoLevelCreateLinks.value = false
  autoLevelModalOpen.value = true
}

const closeAutoLevelModal = () => {
  autoLevelModalOpen.value = false
}

const autoLevelSelectedBlock = computed(() => {
  const selectedIds = (autoLevelSelectedBlockIds.value || []).map((id) => String(id))
  const firstSelectedId = selectedIds[0] || String(autoLevelSelectedBlockId.value || '').trim()
  return autoLevelExpandedBlocks.value.find((block) => String(block.id) === firstSelectedId) || null
})

const toggleAutoLevelStageSelection = (blockId, checked) => {
  const key = String(blockId)
  const next = new Set((autoLevelSelectedBlockIds.value || []).map((id) => String(id)))
  if (checked) next.add(key)
  else next.delete(key)
  autoLevelSelectedBlockIds.value = Array.from(next)
  if (next.size > 0) {
    autoLevelSelectedBlockId.value = autoLevelSelectedBlockIds.value[0]
    syncAutoLevelEffortFromSelected()
  }
}

const selectAllAutoLevelStages = () => {
  const ids = (autoLevelExpandedBlocks.value || []).map((b) => String(b.id))
  autoLevelSelectedBlockIds.value = ids
  if (ids.length) {
    autoLevelSelectedBlockId.value = ids[0]
    syncAutoLevelEffortFromSelected()
  }
}

const clearAllAutoLevelStages = () => {
  autoLevelSelectedBlockIds.value = []
}

const setAutoLevelEmployeeCount = (rawValue) => {
  const n = Math.floor(Number(rawValue) || 1)
  autoLevelEmployeeCount.value = Math.max(1, Math.min(100, n))
}

const decrementAutoLevelEmployeeCount = () => {
  setAutoLevelEmployeeCount((Number(autoLevelEmployeeCount.value) || 1) - 1)
}

const incrementAutoLevelEmployeeCount = () => {
  setAutoLevelEmployeeCount((Number(autoLevelEmployeeCount.value) || 1) + 1)
}

const autoLevelStageMonths = computed(() => {
  const block = autoLevelSelectedBlock.value
  if (!block) return 1
  const start = parseIsoDateLocal(block?.startDate) || parseIsoDateLocal(block?.releaseDate)
  const end = parseIsoDateLocal(block?.releaseDate) || parseIsoDateLocal(block?.startDate)
  if (!start || !end) return 1
  const from = start <= end ? start : end
  const to = start <= end ? end : start
  const days = Math.max(1, dayDiffLocal(from, to) + 1)
  return Math.max(1 / 30, days / 30)
})

const autoLevelTeamCapacityHours = computed(() => {
  const employees = Math.max(1, Math.floor(Number(autoLevelEmployeeCount.value) || 1))
  return employees * AUTO_LEVEL_MONTHLY_HOURS_PER_EMPLOYEE * autoLevelStageMonths.value
})

const autoLevelRequiredEmployees = computed(() => {
  const needed = Math.ceil((Math.max(1, Number(autoLevelTotalEffort.value) || 1)) /
    (AUTO_LEVEL_MONTHLY_HOURS_PER_EMPLOYEE * autoLevelStageMonths.value))
  return Math.max(1, needed)
})

const autoLevelHasOverload = computed(() =>
  Math.max(1, Number(autoLevelTotalEffort.value) || 1) > autoLevelTeamCapacityHours.value
)

const autoLevelIncludeWeekendsResolved = computed(() => !Boolean(autoLevelIncludeWeekends.value))

const autoLevelStageWorkingDays = computed(() => {
  const block = autoLevelSelectedBlock.value
  if (!block) return 1
  const start = parseIsoDateLocal(block?.startDate) || parseIsoDateLocal(block?.releaseDate)
  const end = parseIsoDateLocal(block?.releaseDate) || parseIsoDateLocal(block?.startDate)
  if (!start || !end) return 1
  const from = start <= end ? start : end
  const to = start <= end ? end : start
  const includeWeekends = autoLevelIncludeWeekendsResolved.value
  let cursor = startOfLocalDay(from)
  const endDay = startOfLocalDay(to)
  let count = 0
  while (cursor.getTime() <= endDay.getTime()) {
    if (isWorkingDate(cursor, includeWeekends)) count += 1
    cursor = addDaysLocal(cursor, 1)
  }
  return Math.max(1, count)
})

const autoLevelDurationTeamCapacityHours = computed(() => {
  const employees = Math.max(1, Math.floor(Number(autoLevelEmployeeCount.value) || 1))
  return employees * AUTO_LEVEL_WORK_HOURS_PER_EMPLOYEE * autoLevelStageWorkingDays.value
})

const autoLevelDurationRequiredEmployees = computed(() => {
  const totalEffort = Math.max(1, Number(autoLevelTotalEffort.value) || 1)
  const perEmployeeCapacity = AUTO_LEVEL_WORK_HOURS_PER_EMPLOYEE * autoLevelStageWorkingDays.value
  const needed = Math.ceil(totalEffort / Math.max(1, perEmployeeCapacity))
  return Math.max(1, needed)
})

const autoLevelDurationRequiredHoursPerEmployeePerDay = computed(() => {
  const employees = Math.max(1, Math.floor(Number(autoLevelEmployeeCount.value) || 1))
  const totalEffort = Math.max(1, Number(autoLevelTotalEffort.value) || 1)
  return totalEffort / (employees * Math.max(1, autoLevelStageWorkingDays.value))
})

const autoLevelDurationHasOverload = computed(() =>
  Math.max(1, Number(autoLevelTotalEffort.value) || 1) > autoLevelDurationTeamCapacityHours.value
)

const syncAutoLevelEffortFromSelected = () => {
  const selectedId = String(
    (autoLevelSelectedBlockIds.value && autoLevelSelectedBlockIds.value[0]) || autoLevelSelectedBlockId.value || ''
  ).trim()
  const selected = autoLevelExpandedBlocks.value.find((block) => String(block.id) === selectedId)
  if (!selected) return
  autoLevelSelectedBlockId.value = selectedId
  autoLevelTotalEffort.value = Math.max(1, Math.round(getBlockTotalEffortHours(selected)))
}

const restoreLevelingSnapshot = async ({ clearSnapshot = false } = {}) => {
  const snapshot = levelingSnapshot.value
  if (!snapshot) return 0
  let restoredBlocks = 0
  for (const snapBlock of snapshot.blocks || []) {
    const liveBlock = (blocks.value || []).find((b) => String(b.id) === String(snapBlock.blockId))
    if (!liveBlock) continue
    const taskSnapshotMap = new Map(
      (snapBlock.tasks || [])
        .filter((t) => t.taskId !== null && t.taskId !== undefined)
        .map((t) => [String(t.taskId), t])
    )
    let changed = false
    const nextTasks = (liveBlock.tasks || []).map((task) => {
      if (task?.id === null || task?.id === undefined) return task
      const snapTask = taskSnapshotMap.get(String(task.id))
      if (!snapTask) return task
      const startDate = String(snapTask.startDate || '')
      const releaseDate = String(snapTask.releaseDate || '')
      const effort = Number(snapTask.effort || 0)
      const predecessorIds = normalizePredecessorIds(snapTask.predecessorIds)
      const predecessorLinks = Array.isArray(snapTask.predecessorLinks) ? snapTask.predecessorLinks : []
      const samePredIds = (() => {
        const cur = normalizePredecessorIds(task.predecessorIds)
        return cur.length === predecessorIds.length && cur.every((id, idx) => id === predecessorIds[idx])
      })()
      const samePredLinks = (() => {
        const cur = getTaskDependencyLinks(task)
        if (cur.length !== predecessorLinks.length) return false
        return cur.every((dep, idx) =>
          String(dep.predId) === String(predecessorLinks[idx]?.predId) &&
          normalizeDependencyType(dep.type) === normalizeDependencyType(predecessorLinks[idx]?.type) &&
          Number(normalizeLagDays(dep.lagDays)) === Number(normalizeLagDays(predecessorLinks[idx]?.lagDays))
        )
      })()
      if (
        (task.startDate || '') === startDate &&
        (task.releaseDate || '') === releaseDate &&
        Number(task.effort || 0) === effort &&
        samePredIds &&
        samePredLinks
      ) return task
      changed = true
      return { ...task, startDate, releaseDate, effort, predecessorIds, predecessorLinks }
    })
    if (!changed) continue
    const res = await updateBlock({ ...liveBlock, tasks: nextTasks })
    if (!res?.success) {
      showNotificationMessage(`Не удалось откатить выравнивание в этапе "${liveBlock.title || liveBlock.id}"`, 'error')
      continue
    }
    restoredBlocks += 1
  }
  if (clearSnapshot && restoredBlocks > 0) levelingSnapshot.value = null
  return restoredBlocks
}

const applyAutoLevelResources = async () => {
  if (readOnly.value || isLevelingResources.value || isUndoLevelingResources.value) return

  const selectedIds = Array.from(new Set((autoLevelSelectedBlockIds.value || []).map((id) => String(id))))
  const blockById = new Map((blocks.value || []).map((b) => [String(b.id), b]))
  const selectedBlocks = selectedIds
    .map((id) => blockById.get(String(id)) || null)
    .filter(Boolean)
  if (!selectedBlocks.length) {
    showNotificationMessage('Выберите хотя бы один этап для автораспределения', 'warning')
    return
  }

  const employeeCount = Math.max(1, Math.floor(Number(autoLevelEmployeeCount.value) || 1))
  const includeWeekends = !Boolean(autoLevelIncludeWeekends.value)
  const distributionMode = String(autoLevelDistributionMode.value || 'effort')
  const snapshot = createLevelingSnapshot()

  const applyForBlock = async (block, totalEffort) => {
    const orderedTasks = getTasksByOrder(block)
    if (!orderedTasks.length) return { success: true, changed: false }

    const perTaskEffort = totalEffort / orderedTasks.length
    let singleTaskCapacityPerDay = AUTO_LEVEL_WORK_HOURS_PER_EMPLOYEE
    const taskCount = orderedTasks.length
    let durationDaysPerTask = Array.from({ length: taskCount }, () =>
      Math.max(1, Math.ceil(perTaskEffort / singleTaskCapacityPerDay))
    )
    let taskEffortPerTask = Array.from({ length: taskCount }, () => Number(perTaskEffort.toFixed(2)))

    const blockStartRaw =
      parseIsoDateLocal(block?.startDate) ||
      parseIsoDateLocal(block?.releaseDate) ||
      startOfLocalDay(visibleRange.value.start)
    const blockEndRaw =
      parseIsoDateLocal(block?.releaseDate) ||
      parseIsoDateLocal(block?.startDate) ||
      blockStartRaw
    const stageFrom = startOfLocalDay(blockStartRaw <= blockEndRaw ? blockStartRaw : blockEndRaw)
    const stageTo = startOfLocalDay(blockStartRaw <= blockEndRaw ? blockEndRaw : blockStartRaw)
    const stageDays = Math.max(1, dayDiffLocal(stageFrom, stageTo) + 1)
    const stageMonths = Math.max(1 / 30, stageDays / 30)
    let stageWorkingDays = 0
    let cursor = startOfLocalDay(stageFrom)
    const endDay = startOfLocalDay(stageTo)
    while (cursor.getTime() <= endDay.getTime()) {
      if (isWorkingDate(cursor, includeWeekends)) stageWorkingDays += 1
      cursor = addDaysLocal(cursor, 1)
    }
    stageWorkingDays = Math.max(1, stageWorkingDays)
    const hasOverloadEffort = totalEffort > employeeCount * AUTO_LEVEL_MONTHLY_HOURS_PER_EMPLOYEE * stageMonths
    const hasOverloadDuration = totalEffort > employeeCount * AUTO_LEVEL_WORK_HOURS_PER_EMPLOYEE * stageWorkingDays
    // Полосы не должны выходить за границы этапа: при перегрузе повышаем расчетную дневную
    // нагрузку на сотрудника, а не растягиваем задачи за пределы этапа.
    const enforceStageBounds = true
    const clampTaskDatesToStage = (startDateObj, endDateObj) => {
      if (!enforceStageBounds) return { start: startOfLocalDay(startDateObj), end: startOfLocalDay(endDateObj) }
      let start = startOfLocalDay(startDateObj)
      let end = startOfLocalDay(endDateObj)
      if (start < stageFrom) start = stageFrom
      if (start > stageTo) start = stageTo
      if (end < stageFrom) end = stageFrom
      if (end > stageTo) end = stageTo
      if (end < start) end = start
      return { start, end }
    }

    if (distributionMode === 'duration') {
      const parallelCapacityForDuration = employeeCount >= 2 ? employeeCount : 1
      const taskWorkingDaysBudget = stageWorkingDays * parallelCapacityForDuration
      if (taskWorkingDaysBudget >= taskCount) {
        const base = Math.floor(taskWorkingDaysBudget / taskCount)
        const rem = taskWorkingDaysBudget - base * taskCount
        durationDaysPerTask = Array.from({ length: taskCount }, (_, i) => base + (i < rem ? 1 : 0))
      } else {
        durationDaysPerTask = Array.from({ length: taskCount }, () => 1)
      }
      const sumDurationDays = durationDaysPerTask.reduce((acc, v) => acc + v, 0)
      let sumEffortRounded = 0
      taskEffortPerTask = Array.from({ length: taskCount }, () => 0)
      for (let i = 0; i < taskCount; i += 1) {
        if (i === taskCount - 1) break
        const exactEffort = totalEffort * (durationDaysPerTask[i] / Math.max(1, sumDurationDays))
        const rounded = Number(exactEffort.toFixed(2))
        taskEffortPerTask[i] = rounded
        sumEffortRounded += rounded
      }
      taskEffortPerTask[taskCount - 1] = Number((totalEffort - sumEffortRounded).toFixed(2))
    } else {
      // Effort-mode: подбираем дневную нагрузку на сотрудника так, чтобы уложиться в этап.
      const minRequiredHoursPerEmployeePerDay =
        totalEffort / Math.max(1, employeeCount * stageWorkingDays)
      singleTaskCapacityPerDay = Math.max(
        AUTO_LEVEL_WORK_HOURS_PER_EMPLOYEE,
        minRequiredHoursPerEmployeePerDay
      )
      durationDaysPerTask = Array.from({ length: taskCount }, () =>
        Math.max(1, Math.ceil(perTaskEffort / Math.max(0.1, singleTaskCapacityPerDay)))
      )
    }

    const nextById = new Map()
    const parallelCapacity = employeeCount >= 2 ? employeeCount : 1
    if (parallelCapacity === 1) {
      let cursorStart = startOfLocalDay(blockStartRaw)
      let previousTaskId = ''
      for (let taskIndex = 0; taskIndex < orderedTasks.length; taskIndex += 1) {
        const task = orderedTasks[taskIndex]
        const taskId = task?.id !== null && task?.id !== undefined && task?.id !== '' ? String(task.id) : ''
        const durationDays = durationDaysPerTask[taskIndex] || 1
        const startDateObj = startOfLocalDay(cursorStart)
        const endDateObj = addScheduleDaysInclusive(startDateObj, durationDays, includeWeekends)
        const bounded = clampTaskDatesToStage(startDateObj, endDateObj)
        const predecessorIds = autoLevelCreateLinks.value && previousTaskId
          ? normalizePredecessorIds([previousTaskId])
          : []
        const payload = {
          ...task,
          effort: Number((taskEffortPerTask[taskIndex] ?? perTaskEffort).toFixed(2)),
          startDate: toIsoDateLocal(bounded.start),
          releaseDate: toIsoDateLocal(bounded.end),
          predecessorIds,
          predecessorLinks: predecessorIds.map((predId) => ({ predId, type: 'FS', lagDays: 0 }))
        }
        if (taskId) {
          nextById.set(taskId, payload)
          previousTaskId = taskId
        }
        cursorStart = nextWorkingDate(addDaysLocal(bounded.end, 1), includeWeekends)
      }
    } else {
      const laneNextDates = Array.from({ length: parallelCapacity }, () => startOfLocalDay(blockStartRaw))
      const lanePreviousTaskIds = Array.from({ length: parallelCapacity }, () => '')
      for (let taskIndex = 0; taskIndex < orderedTasks.length; taskIndex += 1) {
        const task = orderedTasks[taskIndex]
        const taskId = task?.id !== null && task?.id !== undefined && task?.id !== '' ? String(task.id) : ''
        let laneIndex = 0
        let laneStart = laneNextDates[0]
        for (let i = 1; i < laneNextDates.length; i += 1) {
          if (laneNextDates[i].getTime() < laneStart.getTime()) {
            laneStart = laneNextDates[i]
            laneIndex = i
          }
        }
        const durationDays = durationDaysPerTask[taskIndex] || 1
        const startDateObj = startOfLocalDay(laneStart)
        const endDateObj = addScheduleDaysInclusive(startDateObj, durationDays, includeWeekends)
        const bounded = clampTaskDatesToStage(startDateObj, endDateObj)
        const predecessorIds = autoLevelCreateLinks.value && lanePreviousTaskIds[laneIndex]
          ? normalizePredecessorIds([lanePreviousTaskIds[laneIndex]])
          : []
        const payload = {
          ...task,
          effort: Number((taskEffortPerTask[taskIndex] ?? perTaskEffort).toFixed(2)),
          startDate: toIsoDateLocal(bounded.start),
          releaseDate: toIsoDateLocal(bounded.end),
          predecessorIds,
          predecessorLinks: predecessorIds.map((predId) => ({ predId, type: 'FS', lagDays: 0 }))
        }
        if (taskId) {
          nextById.set(taskId, payload)
          lanePreviousTaskIds[laneIndex] = taskId
        }
        laneNextDates[laneIndex] = nextWorkingDate(addDaysLocal(bounded.end, 1), includeWeekends)
      }
    }

    let changed = false
    const fallbackQueue = [...orderedTasks]
    const nextTasks = (block.tasks || []).map((task) => {
      let next = null
      if (task?.id !== null && task?.id !== undefined && task?.id !== '') next = nextById.get(String(task.id)) || null
      else next = fallbackQueue.shift() || null
      if (!next) return task
      const currentPredIds = normalizePredecessorIds(task.predecessorIds)
      const nextPredIds = normalizePredecessorIds(next.predecessorIds)
      const samePreds =
        currentPredIds.length === nextPredIds.length &&
        currentPredIds.every((id, idx) => id === nextPredIds[idx])
      if (
        String(task.startDate || '') === String(next.startDate || '') &&
        String(task.releaseDate || '') === String(next.releaseDate || '') &&
        Number(task.effort || 0) === Number(next.effort || 0) &&
        samePreds
      ) return task
      changed = true
      return {
        ...task,
        startDate: next.startDate,
        releaseDate: next.releaseDate,
        effort: next.effort,
        predecessorIds: normalizePredecessorIds(next.predecessorIds),
        predecessorLinks: Array.isArray(next.predecessorLinks) ? next.predecessorLinks : []
      }
    })

    if (!changed && Number(block.effort || 0) === Number(totalEffort)) return { success: true, changed: false }
    const res = await updateBlock({ ...block, effort: totalEffort, tasks: nextTasks })
    return { success: Boolean(res?.success), changed }
  }

  isLevelingResources.value = true
  try {
    if (levelingSnapshot.value) await restoreLevelingSnapshot({ clearSnapshot: false })
    let successCount = 0
    let changedCount = 0
    for (const block of selectedBlocks) {
      const totalEffort = selectedBlocks.length <= 1
        ? Math.max(1, Number(autoLevelTotalEffort.value) || 1)
        : Math.max(1, Math.round(getBlockTotalEffortHours(block)))
      const res = await applyForBlock(block, totalEffort)
      if (!res.success) {
        showNotificationMessage(`Не удалось автораспределить задачи этапа "${block.title || block.id}"`, 'error')
        continue
      }
      successCount += 1
      if (res.changed) changedCount += 1
    }

    if (!successCount) {
      showNotificationMessage('⚖️ Не удалось применить автораспределение', 'warning')
      return
    }
    levelingSnapshot.value = snapshot
    autoLevelModalOpen.value = false
    if (!changedCount) showNotificationMessage('⚖️ Изменений не потребовалось', 'warning')
    else showNotificationMessage(`⚖️ Автораспределение выполнено (${successCount} этап.)`, 'success')
  } finally {
    isLevelingResources.value = false
  }
}

const resetStageTaskDates = async (block) => {
  if (readOnly.value || !block) return
  const stageStart =
    parseIsoDateLocal(block?.startDate) ||
    parseIsoDateLocal(block?.releaseDate) ||
    startOfLocalDay(visibleRange.value.start)
  const stageStartIso = toIsoDateLocal(stageStart)
  let changed = false
  const nextTasks = (block.tasks || []).map((task) => {
    const hadLinks = normalizePredecessorIds(task.predecessorIds).length > 0 || getTaskDependencyLinks(task).length > 0
    const sameDates = (task.startDate || '') === stageStartIso && (task.releaseDate || '') === stageStartIso
    if (sameDates && !hadLinks) return task
    changed = true
    return {
      ...task,
      startDate: stageStartIso,
      releaseDate: stageStartIso,
      predecessorIds: [],
      predecessorLinks: []
    }
  })
  if (!changed) {
    showNotificationMessage('Даты и связи задач уже сброшены', 'warning')
    return
  }
  const res = await updateBlock({ ...block, tasks: nextTasks })
  if (!res?.success) {
    showNotificationMessage('Не удалось сбросить даты и связи задач этапа', 'error')
    return
  }
  showNotificationMessage('Даты задач и связи этапа сброшены', 'success')
}

const undoAutoLevelResources = async () => {
  if (readOnly.value || isUndoLevelingResources.value || !levelingSnapshot.value) return
  isUndoLevelingResources.value = true
  try {
    const restoredBlocks = await restoreLevelingSnapshot({ clearSnapshot: true })
    if (restoredBlocks > 0) {
      showNotificationMessage(`↩️ Выравнивание откатено (${restoredBlocks} этап${restoredBlocks > 1 ? 'ов' : ''})`, 'success')
    } else {
      showNotificationMessage('↩️ Откат: изменений не найдено', 'warning')
    }
  } finally {
    isUndoLevelingResources.value = false
  }
}

const undoLastStageOrTaskEdit = async () => {
  if (readOnly.value || isUndoLastManualGanttEdit.value || isUndoLevelingResources.value) return

  if (!lastManualGanttEditSnapshot.value) {
    // Если ручных действий не было — откатываем последнее автовыравнивание.
    return undoAutoLevelResources()
  }

  const snap = lastManualGanttEditSnapshot.value
  isUndoLastManualGanttEdit.value = true

  try {
    if (snap?.type === 'stage') {
      const liveBlock = (blocks.value || []).find((b) => String(b.id) === String(snap.blockId))
      if (!liveBlock) return

      const res = await updateBlock({
        ...liveBlock,
        startDate: snap.prevStartDate,
        releaseDate: snap.prevReleaseDate
      })

      if (!res?.success) {
        showNotificationMessage('Не удалось отменить изменение этапа', 'error')
        return
      }

      showNotificationMessage('↩️ Отмена последнего изменения этапа', 'success')
      lastManualGanttEditSnapshot.value = null
      return
    }

    if (snap?.type === 'task') {
      const liveBlock = (blocks.value || []).find((b) => String(b.id) === String(snap.blockId))
      if (!liveBlock) return

      const map = new Map((snap.tasks || []).map((t) => [String(t.taskId), t]))
      const nextTasks = (liveBlock.tasks || []).map((task) => {
        const key = task?.id === null || task?.id === undefined ? null : String(task.id)
        if (!key) return task
        const prior = map.get(key)
        if (!prior) return task
        return {
          ...task,
          startDate: prior.startDate,
          releaseDate: prior.releaseDate
        }
      })

      const res = await updateBlock({ ...liveBlock, tasks: nextTasks })
      if (!res?.success) {
        showNotificationMessage('Не удалось отменить изменение задач', 'error')
        return
      }

      showNotificationMessage('↩️ Отмена последнего изменения задач', 'success')
      lastManualGanttEditSnapshot.value = null
      return
    }

    if (snap?.type === 'dependency') {
      if (snap?.scope === 'task') {
        const liveBlock = (blocks.value || []).find((b) => String(b.id) === String(snap.blockId))
        if (!liveBlock) return
        const map = new Map((snap.tasks || []).map((t) => [String(t.taskId), t]))
        const nextTasks = (liveBlock.tasks || []).map((task) => {
          const key = task?.id === null || task?.id === undefined ? null : String(task.id)
          if (!key) return task
          const prior = map.get(key)
          if (!prior) return task
          return {
            ...task,
            predecessorIds: normalizePredecessorIds(prior.predecessorIds),
            predecessorLinks: Array.isArray(prior.predecessorLinks) ? prior.predecessorLinks : []
          }
        })

        const res = await updateBlock({ ...liveBlock, tasks: nextTasks })
        if (!res?.success) {
          showNotificationMessage('Не удалось отменить изменение зависимостей задач', 'error')
          return
        }

        showNotificationMessage('↩️ Отмена последнего изменения линий связи задач', 'success')
        lastManualGanttEditSnapshot.value = null
        return
      }

      if (snap?.scope === 'stage') {
        const liveSucc = (blocks.value || []).find((b) => String(b.id) === String(snap.succBlockId))
        if (!liveSucc) return

        const res = await updateBlock({
          ...liveSucc,
          stagePredecessorIds: normalizeStagePredecessorIds(snap.prevStagePredecessorIds)
        })
        if (!res?.success) {
          showNotificationMessage('Не удалось отменить изменение зависимостей этапов', 'error')
          return
        }

        // Восстанавливаем localStorage-хранилища линий.
        stageDepStorage.value = snap.prevStageDepStorage || {}
        stageDepLabels.value = snap.prevStageDepLabels || {}
        writeStageDepStorage()
        writeStageDepLabels()

        showNotificationMessage('↩️ Отмена последнего изменения линий связи этапов', 'success')
        lastManualGanttEditSnapshot.value = null
        return
      }
    }
  } finally {
    isUndoLastManualGanttEdit.value = false
  }
}

const predecessorTitles = (block, task) => {
  const ids = getTaskDependencyLinks(task).map((dep) => String(dep.predId))
  if (!ids.length) return []
  const list = getSortedBlockTasks(block)
  const map = new Map(list.map((t) => [String(t.id), t.title || t.id]))
  return ids.map((id) => map.get(String(id)) || id)
}

const taskHasPredecessors = (task) => getTaskDependencyLinks(task).length > 0

const taskGanttTitle = (block, task) => {
  const base = task.title || ''
  const preds = predecessorTitles(block, task)
  if (!preds.length) return base
  return `${base}\nПосле: ${preds.join(' · ')}`
}

const getCriticalTaskKey = (task, idx) => task?.id || `idx-${idx}`

/**
 * Критический путь внутри этапа:
 * - считаем граф зависимостей задач;
 * - вес задачи берём из effort (0/пусто => 1);
 * - находим задачи, лежащие на максимальном (по сумме трудозатрат) пути.
 */
const criticalPathByBlock = computed(() => {
  const out = new Map()

  for (const block of filteredGanttBlocks.value) {
    const tasks = getTasksByOrder(block)
    if (!tasks.length) {
      out.set(block.id, {
        criticalTaskKeys: new Set(),
        pathLength: 0,
        taskScoreByKey: new Map(),
        taskLinkCountByKey: new Map()
      })
      continue
    }

    const idToKey = new Map()
    const keys = []
    const taskWeightByKey = new Map()
    tasks.forEach((task, idx) => {
      const key = getCriticalTaskKey(task, idx)
      keys.push(key)
      if (task?.id) idToKey.set(task.id, key)
      const effort = Number(task?.effort)
      taskWeightByKey.set(key, Number.isFinite(effort) && effort > 0 ? effort : 1)
    })

    const indeg = new Map()
    const succ = new Map()
    const taskLinkCountByKey = new Map(keys.map((k) => [k, 0]))
    keys.forEach((k) => {
      indeg.set(k, 0)
      succ.set(k, [])
    })

    let hasDependencies = false
    tasks.forEach((task, idx) => {
      const toKey = keys[idx]
      const deps = getTaskDependencyLinks(task)
      for (const dep of deps) {
        const predId = dep.predId
        const fromKey = idToKey.get(predId)
        if (!fromKey || fromKey === toKey) continue
        succ.get(fromKey).push(toKey)
        indeg.set(toKey, (indeg.get(toKey) || 0) + 1)
        taskLinkCountByKey.set(fromKey, (taskLinkCountByKey.get(fromKey) || 0) + 1)
        taskLinkCountByKey.set(toKey, (taskLinkCountByKey.get(toKey) || 0) + 1)
        hasDependencies = true
      }
    })

    if (!hasDependencies) {
      out.set(block.id, {
        criticalTaskKeys: new Set(),
        pathLength: 0,
        taskScoreByKey: new Map(),
        taskLinkCountByKey
      })
      continue
    }

    const q = []
    indeg.forEach((deg, key) => { if (deg === 0) q.push(key) })
    const topo = []
    while (q.length) {
      const cur = q.shift()
      topo.push(cur)
      for (const nx of succ.get(cur) || []) {
        const nd = (indeg.get(nx) || 0) - 1
        indeg.set(nx, nd)
        if (nd === 0) q.push(nx)
      }
    }

    if (topo.length !== keys.length) {
      // При цикле путь не считаем, чтобы не подсвечивать неверно.
      out.set(block.id, {
        criticalTaskKeys: new Set(),
        pathLength: 0,
        taskScoreByKey: new Map(),
        taskLinkCountByKey
      })
      continue
    }

    const distFromStart = new Map(keys.map((k) => [k, Number.NEGATIVE_INFINITY]))
    topo.forEach((k) => {
      const weight = taskWeightByKey.get(k) || 1
      if ((distFromStart.get(k) ?? Number.NEGATIVE_INFINITY) < weight) distFromStart.set(k, weight)
      const base = distFromStart.get(k) || weight
      for (const nx of succ.get(k) || []) {
        const cand = base + (taskWeightByKey.get(nx) || 1)
        if (cand > (distFromStart.get(nx) ?? Number.NEGATIVE_INFINITY)) distFromStart.set(nx, cand)
      }
    })

    const distToEnd = new Map(keys.map((k) => [k, taskWeightByKey.get(k) || 1]))
    for (let i = topo.length - 1; i >= 0; i--) {
      const k = topo[i]
      let best = taskWeightByKey.get(k) || 1
      for (const nx of succ.get(k) || []) {
        const cand = (taskWeightByKey.get(k) || 1) + (distToEnd.get(nx) || 1)
        if (cand > best) best = cand
      }
      distToEnd.set(k, best)
    }

    const pathLength = Math.max(...Array.from(distFromStart.values()))
    const criticalTaskKeys = new Set()
    const taskScoreByKey = new Map()
    for (const key of keys) {
      const weight = taskWeightByKey.get(key) || 1
      const total = (distFromStart.get(key) || weight) + (distToEnd.get(key) || weight) - weight
      taskScoreByKey.set(key, total)
      if (total === pathLength) criticalTaskKeys.add(key)
    }

    out.set(block.id, { criticalTaskKeys, pathLength, taskScoreByKey, taskLinkCountByKey })
  }

  return out
})

const isCriticalTask = (block, task, idx) => {
  const blockData = criticalPathByBlock.value.get(block.id)
  if (!blockData || blockData.pathLength < 2) return false
  return blockData.criticalTaskKeys.has(getCriticalTaskKey(task, idx))
}

const isCriticalStage = (block) => {
  const blockData = criticalPathByBlock.value.get(block.id)
  return !!blockData && blockData.pathLength >= 2
}

/** Silver — не начато; LightGreen — завершено; SkyBlue — трек при активных задачах и сегмент задачи «в работе». */
const GANTT_COLOR_NOT_STARTED = '#C0C0C0'
const GANTT_COLOR_DONE = '#90EE90'
const GANTT_COLOR_PROGRESS_TASK = '#87CEEB'

const getTaskStatusColor = (status) => {
  switch (status) {
    case 'done': return GANTT_COLOR_DONE
    case 'progress': return GANTT_COLOR_PROGRESS_TASK
    default: return GANTT_COLOR_NOT_STARTED
  }
}

const getTaskStatusIcon = (status) => {
  switch (status) {
    case 'done': return '✅'
    case 'progress': return '🕛'
    default: return '○'
  }
}

const isTaskOverdue = (task) => {
  if (!task || task.status === 'done') return false
  const release = parseIsoDateLocal(task.releaseDate) || parseIsoDateLocal(task.startDate)
  if (!release) return false
  return release < startOfLocalDay(new Date())
}

const getTaskBarColor = (task) => {
  if (isTaskOverdue(task)) return '#ef4444'
  return getTaskStatusColor(task?.status)
}

const isTaskOverflowingStage = (block, task) => {
  const blockStartRaw = parseIsoDateLocal(block?.startDate) || parseIsoDateLocal(block?.releaseDate)
  const blockEndRaw = parseIsoDateLocal(block?.releaseDate) || parseIsoDateLocal(block?.startDate)
  const taskStartRaw = parseIsoDateLocal(task?.startDate) || parseIsoDateLocal(task?.releaseDate)
  const taskEndRaw = parseIsoDateLocal(task?.releaseDate) || parseIsoDateLocal(task?.startDate)
  if (!blockStartRaw || !blockEndRaw || !taskStartRaw || !taskEndRaw) return false
  const stageFrom = startOfLocalDay(blockStartRaw <= blockEndRaw ? blockStartRaw : blockEndRaw)
  const stageTo = startOfLocalDay(blockStartRaw <= blockEndRaw ? blockEndRaw : blockStartRaw)
  const taskTo = startOfLocalDay(taskStartRaw <= taskEndRaw ? taskEndRaw : taskStartRaw)
  return taskTo.getTime() > stageTo.getTime()
}

/** Высота полоски подзадачи (совпадает с .task-sub-bar-inner). */
const SUBTASK_BAR_HEIGHT = 23
const TASK_BAR_OFFSET = (TASK_ROW_HEIGHT - SUBTASK_BAR_HEIGHT) / 2

const getFallbackTaskBarLayout = ({ leftPx, widthPx, count, taskIdx }) => {
  const segWidthPx = widthPx / count
  const left = leftPx + taskIdx * segWidthPx
  const width = Math.max(24, segWidthPx)
  return { left, width }
}

/** Числовая геометрия сегмента задачи (как у полоски на таймлайне), пиксели относительно строки этапа. */
const getTaskBarLayout = (block, taskIdx) => {
  const tasks = getSortedBlockTasks(block)
  const count = tasks.length
  if (!count) return null

  const stageStyle = getBarStyleWithPreview(block) || {}
  const leftPx = typeof stageStyle.left === 'string' ? parseFloat(stageStyle.left) : NaN
  const widthPx = typeof stageStyle.width === 'string' ? parseFloat(stageStyle.width) : NaN
  if (Number.isNaN(leftPx) || Number.isNaN(widthPx) || widthPx <= 0) return null
  const task = tasks[taskIdx]
  const drag = taskBarDrag.value
  const isDragged = doesTaskBarDragMatch(drag, block, task, taskIdx)
  const preview = task?.id !== null && task?.id !== undefined
    ? taskDragLinkedPreviewMap.value.get(String(task.id))
    : null

  if (isDragged && drag.mode === 'move' && Number.isFinite(drag.previewLeftPx) && Number.isFinite(drag.widthPx)) {
    const top = STAGE_ROW_HEIGHT + taskIdx * TASK_ROW_HEIGHT + TASK_BAR_OFFSET
    const height = SUBTASK_BAR_HEIGHT
    return { left: drag.previewLeftPx, width: drag.widthPx, top, height }
  }

  const blockStartRaw = parseIsoDateLocal(block?.startDate) || parseIsoDateLocal(block?.releaseDate)
  const blockEndRaw = parseIsoDateLocal(block?.releaseDate) || parseIsoDateLocal(block?.startDate)
  const taskStartSource = isDragged
    ? drag.previewStartIso
    : (preview?.startDate || task?.startDate)
  const taskEndSource = isDragged
    ? drag.previewEndIso
    : (preview?.releaseDate || task?.releaseDate)
  let taskStartRaw = parseIsoDateLocal(taskStartSource) || parseIsoDateLocal(task?.releaseDate)
  let taskEndRaw = parseIsoDateLocal(taskEndSource) || parseIsoDateLocal(task?.startDate)

  // Для задач без дат показываем 1 день от старта этапа:
  // это дает явную точку на шкале и упрощает дальнейшее редактирование даты.
  if (!taskStartRaw && !taskEndRaw && blockStartRaw) {
    const stageStart = startOfLocalDay(blockStartRaw)
    taskStartRaw = stageStart
    taskEndRaw = stageStart
  }

  let left = leftPx
  let width = widthPx
  let overflowLeftPx = 0
  let overflowRightPx = 0
  if (!blockStartRaw || !blockEndRaw || !taskStartRaw || !taskEndRaw) {
    const fallback = getFallbackTaskBarLayout({ leftPx, widthPx, count, taskIdx })
    left = fallback.left
    width = fallback.width
  } else {
    const stageFrom = startOfLocalDay(blockStartRaw <= blockEndRaw ? blockStartRaw : blockEndRaw)
    const stageTo = startOfLocalDay(blockStartRaw <= blockEndRaw ? blockEndRaw : blockStartRaw)
    const taskFromRaw = startOfLocalDay(taskStartRaw <= taskEndRaw ? taskStartRaw : taskEndRaw)
    const taskToRaw = startOfLocalDay(taskStartRaw <= taskEndRaw ? taskEndRaw : taskStartRaw)
    const totalStageDays = Math.max(1, dayDiffLocal(stageFrom, stageTo) + 1)
    const taskStartIndex = dayDiffLocal(stageFrom, taskFromRaw)
    const taskEndIndex = Math.max(taskStartIndex, dayDiffLocal(stageFrom, taskToRaw))
    const spanDays = Math.max(1, taskEndIndex - taskStartIndex + 1)
    const dayPx = widthPx / totalStageDays
    overflowLeftPx = Math.max(0, -taskStartIndex * dayPx)
    overflowRightPx = Math.max(0, (taskEndIndex - (totalStageDays - 1)) * dayPx)

    const leftRatio = taskStartIndex / totalStageDays
    const widthRatio = spanDays / totalStageDays
    const rawLeft = leftPx + widthPx * leftRatio
    const rawWidth = Math.max(4, widthPx * widthRatio)
    width = Math.max(24, rawWidth)
    left = rawLeft
  }

  const top = STAGE_ROW_HEIGHT + taskIdx * TASK_ROW_HEIGHT + TASK_BAR_OFFSET
  const height = SUBTASK_BAR_HEIGHT

  return { left, width, top, height, overflowLeftPx, overflowRightPx }
}

const getTaskBarPositionStyle = (block, taskIdx) => {
  const layout = getTaskBarLayout(block, taskIdx)
  if (!layout) return {}
  return {
    left: `${layout.left}px`,
    width: `${layout.width}px`,
    top: `${layout.top}px`,
    height: `${layout.height}px`,
    '--overflow-left-px': `${Math.max(0, layout.overflowLeftPx || 0)}px`,
    '--overflow-right-px': `${Math.max(0, layout.overflowRightPx || 0)}px`
  }
}

/**
 * Якорь связи на краю сегмента задачи (центр по вертикали).
 * Координаты относительно верхнего левого угла строки этапа (.timeline-task-row).
 */
const getTaskAnchor = (block, taskIndex, side) => {
  const layout = getTaskBarLayout(block, taskIndex)
  if (!layout || (side !== 'left' && side !== 'right' && side !== 'center')) return null
  const x = side === 'right'
    ? layout.left + layout.width
    : side === 'center'
      ? layout.left + layout.width * 0.5
      : layout.left
  const y = layout.top + layout.height / 2
  return { x, y }
}

const getBlockRowOffsetY = (block) => {
  let y = 0
  for (const b of filteredGanttBlocks.value) {
    if (b.id === block.id) return y
    y += getStageWrapperHeight(b)
  }
  return y
}

const tasksWrapperContentHeight = computed(() =>
  filteredGanttBlocks.value.reduce((sum, b) => sum + getStageWrapperHeight(b), 0)
)

const taskDragLinkedPreviewMap = computed(() => {
  const drag = taskBarDrag.value
  if (!drag) return new Map()
  const block = (blocks.value || []).find((b) => String(b.id) === String(drag.blockKey))
  if (!block?.tasks?.length) return new Map()
  const sourceTask = (block.tasks || []).find((t) =>
    t?.id !== null && t?.id !== undefined && String(t.id) === String(drag.taskKey)
  )
  if (!sourceTask) return new Map()
  const tasksDraft = (block.tasks || []).map((task) => (
    task?.id !== null && task?.id !== undefined && String(task.id) === String(sourceTask.id)
      ? {
        ...task,
        startDate: drag.previewStartIso || drag.startDateIso,
        releaseDate: drag.previewEndIso || drag.endDateIso
      }
      : { ...task }
  ))
  const tasksPreview = enforceFsDependencySchedule(tasksDraft, sourceTask.id)
  const out = new Map()
  for (const task of tasksPreview) {
    if (task?.id === null || task?.id === undefined || task?.id === '') continue
    out.set(String(task.id), {
      startDate: String(task.startDate || ''),
      releaseDate: String(task.releaseDate || '')
    })
  }
  return out
})

const ganttDependencyEdges = ref([])
const ganttDepsSvg = ref(null)
const depDrag = ref(null)
const depDragPointer = ref(null)
const newLinkDrag = ref(null)
const newLinkPointer = ref(null)
const stageLinkDrag = ref(null)
const stageLinkPointer = ref(null)

const depDragPreviewD = computed(() => {
  const drag = depDrag.value
  const ptr = depDragPointer.value
  if (!drag || !ptr) return ''
  if (drag.end === 'from') {
    return `M ${ptr.x} ${ptr.y} L ${drag.anchorX} ${drag.anchorY}`
  }
  return `M ${drag.anchorX} ${drag.anchorY} L ${ptr.x} ${ptr.y}`
})

const newLinkPreviewD = computed(() => {
  const d = newLinkDrag.value
  const p = newLinkPointer.value
  if (!d || !p) return ''
  return `M ${d.anchorX} ${d.anchorY} L ${p.x} ${p.y}`
})

const stageLinkPreviewD = computed(() => {
  const d = stageLinkDrag.value
  const p = stageLinkPointer.value
  if (!d || !p) return ''
  return `M ${d.anchorX} ${d.anchorY} L ${p.x} ${p.y}`
})

const clientToSvgCoords = (svg, clientX, clientY) => {
  if (!svg?.createSVGPoint) return { x: 0, y: 0 }
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

const findTaskBarUnderPoint = (clientX, clientY, blockId = null) => {
  const els = document.elementsFromPoint(clientX, clientY)
  const blockKey = blockId === null || blockId === undefined ? null : String(blockId)
  for (const el of els) {
    if (!(el instanceof Element)) continue
    let node = el
    while (node) {
      if (node.classList?.contains('gantt-dependencies')) break
      if (node.classList?.contains('task-sub-bar-wrap')) {
        const hitBlockId = node.getAttribute('data-block-id')
        const hitTaskId = node.getAttribute('data-task-id')
        if (hitTaskId && (blockKey === null || hitBlockId === blockKey)) {
          return {
            blockId: hitBlockId,
            taskId: hitTaskId
          }
        }
        break
      }
      node = node.parentElement
    }
  }
  return null
}

const findStageBySvgPoint = (svgY, excludeBlockId) => {
  const exclude = String(excludeBlockId)
  let rowOffset = 0
  for (const block of filteredGanttBlocks.value) {
    const blockId = String(block.id)
    const rowHeight = getStageWrapperHeight(block)
    if (blockId !== exclude && svgY >= rowOffset && svgY <= rowOffset + rowHeight) {
      return blockId
    }
    rowOffset += rowHeight
  }
  return null
}

const clearDepDragState = (e) => {
  document.body.classList.remove('is-dep-link-drag')
  const d = depDrag.value
  if (d?.captureEl && e && e.pointerId === d.pointerId) {
    try {
      d.captureEl.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  depDrag.value = null
  depDragPointer.value = null
}

const onDepHandlePointerDown = (e, edge, end) => {
  if (readOnly.value) return
  if (e.button !== 0) return
  e.stopPropagation()
  e.preventDefault()
  const anchor = end === 'from' ? { x: edge.x2, y: edge.y2 } : { x: edge.x1, y: edge.y1 }
  const svg = ganttDepsSvg.value
  depDragPointer.value = svg ? clientToSvgCoords(svg, e.clientX, e.clientY) : { x: 0, y: 0 }
  depDrag.value = {
    blockId: edge.blockId,
    predId: edge.predId,
    succId: edge.succId,
    end,
    anchorX: anchor.x,
    anchorY: anchor.y,
    pointerId: e.pointerId,
    captureEl: e.currentTarget,
  }
  e.currentTarget.setPointerCapture(e.pointerId)
  document.body.classList.add('is-dep-link-drag')
}

const onDepHandlePointerMove = (e) => {
  const d = depDrag.value
  if (!d || e.pointerId !== d.pointerId) return
  const svg = ganttDepsSvg.value
  if (!svg) return
  depDragPointer.value = clientToSvgCoords(svg, e.clientX, e.clientY)
}

const onDepHandlePointerUp = async (e) => {
  const d = depDrag.value
  if (!d || e.pointerId !== d.pointerId) return
  const snapshot = {
    blockId: d.blockId,
    predId: d.predId,
    succId: d.succId,
    end: d.end
  }
  clearDepDragState(e)

  const block = blocks.value.find((b) => b.id === snapshot.blockId)
  if (!block) return

  // Сохраняем состояние линий связи задач до изменения (отменяем кнопкой ↩️).
  lastManualGanttEditSnapshot.value = {
    type: 'dependency',
    at: Date.now(),
    scope: 'task',
    blockId: String(block.id),
    tasks: (block.tasks || [])
      .filter((t) => t?.id !== null && t?.id !== undefined && String(t.id).trim() !== '')
      .map((t) => ({
        taskId: String(t.id),
        predecessorIds: normalizePredecessorIds(t.predecessorIds),
        predecessorLinks: Array.isArray(t.predecessorLinks) ? t.predecessorLinks : []
      }))
  }

  const targetHit = findTaskBarUnderPoint(e.clientX, e.clientY, snapshot.blockId)
  const targetId = targetHit?.taskId
  let updated = null
  if (targetId) {
    if (snapshot.end === 'from') {
      if (targetId !== snapshot.succId && targetId !== snapshot.predId) {
        updated = applyReplacePredecessor(block, snapshot.succId, snapshot.predId, targetId)
      }
    } else if (targetId !== snapshot.predId && targetId !== snapshot.succId) {
      updated = applyMoveSuccessor(block, snapshot.predId, snapshot.succId, targetId)
    }
  }
  if (updated) {
    const res = await updateBlock(updated)
    if (!res.success) {
      lastManualGanttEditSnapshot.value = null
      showNotificationMessage('Не удалось сохранить зависимость', 'error')
    }
  } else if (targetId) {
    lastManualGanttEditSnapshot.value = null
    showNotificationMessage('Связь невозможна (цикл или та же задача)', 'warning')
  } else {
    lastManualGanttEditSnapshot.value = null
  }
}

const onDepHandlePointerCancel = (e) => {
  const d = depDrag.value
  if (!d || e.pointerId !== d.pointerId) return
  clearDepDragState(e)
}

const removeTaskDependency = async (edge) => {
  if (readOnly.value) return
  const block = blocks.value.find((b) => String(b.id) === String(edge.blockId))
  if (!block) return

  lastManualGanttEditSnapshot.value = {
    type: 'dependency',
    at: Date.now(),
    scope: 'task',
    blockId: String(block.id),
    tasks: (block.tasks || [])
      .filter((t) => t?.id !== null && t?.id !== undefined && String(t.id).trim() !== '')
      .map((t) => ({
        taskId: String(t.id),
        predecessorIds: normalizePredecessorIds(t.predecessorIds),
        predecessorLinks: Array.isArray(t.predecessorLinks) ? t.predecessorLinks : []
      }))
  }

  const tasks = getTasksByOrder(block).map((t) => ({
    ...t,
    predecessorIds: normalizePredecessorIds(t.predecessorIds)
  }))
  const succTask = tasks.find((t) => String(t.id) === String(edge.succId))
  if (!succTask) return
  const beforeLinks = getTaskDependencyLinks(succTask)
  if (!beforeLinks.some((dep) => String(dep.predId) === String(edge.predId))) {
    lastManualGanttEditSnapshot.value = null
    return
  }
  const nextLinks = beforeLinks.filter((dep) => String(dep.predId) !== String(edge.predId))
  succTask.predecessorLinks = nextLinks
  succTask.predecessorIds = normalizePredecessorIds(nextLinks.map((dep) => String(dep.predId)))
  const updated = { ...block, tasks }
  const res = await updateBlock(updated)
  if (!res.success) {
    lastManualGanttEditSnapshot.value = null
    showNotificationMessage('Не удалось удалить связь задач', 'error')
  }
}

const onTaskDepPathDblClick = (seg) => {
  clearTimeout(taskEdgeClickTimer)
  taskEdgeClickTimer = null
  closeTaskDepEditor()
  removeTaskDependency(seg)
}

const onTaskDepPathClick = (e, seg) => {
  if (readOnly.value) return
  clearTimeout(taskEdgeClickTimer)
  taskEdgeClickTimer = setTimeout(() => {
    openTaskDepEditor(e, seg)
    taskEdgeClickTimer = null
  }, 250)
}

const clearNewLinkState = (e) => {
  document.body.classList.remove('is-dep-link-drag')
  const d = newLinkDrag.value
  if (d?.captureEl && e && e.pointerId === d.pointerId) {
    try {
      d.captureEl.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  newLinkDrag.value = null
  newLinkPointer.value = null
}

const clearStageLinkState = (e) => {
  document.body.classList.remove('is-dep-link-drag')
  const d = stageLinkDrag.value
  if (d?.captureEl && e && e.pointerId === d.pointerId) {
    try {
      d.captureEl.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  stageLinkDrag.value = null
  stageLinkPointer.value = null
}

const onNewLinkPointerDown = (e, block, task, idx) => {
  if (readOnly.value) return
  if (e.button !== 0) return
  const anchor = getTaskAnchor(block, idx, 'right')
  if (!anchor) return
  const rowY = getBlockRowOffsetY(block)
  const svg = ganttDepsSvg.value
  newLinkPointer.value = svg ? clientToSvgCoords(svg, e.clientX, e.clientY) : { x: 0, y: 0 }
  newLinkDrag.value = {
    blockId: block.id,
    sourceId: task.id,
    anchorX: anchor.x,
    anchorY: rowY + anchor.y,
    pointerId: e.pointerId,
    captureEl: e.currentTarget
  }
  e.currentTarget.setPointerCapture(e.pointerId)
  document.body.classList.add('is-dep-link-drag')
}

const onTaskLinkStartPointerDown = (e, block, task, idx) => {
  if (readOnly.value) return
  onNewLinkPointerDown(e, block, task, idx)
}

const onNewLinkPointerMove = (e) => {
  const d = newLinkDrag.value
  if (!d || e.pointerId !== d.pointerId) return
  const svg = ganttDepsSvg.value
  if (!svg) return
  newLinkPointer.value = clientToSvgCoords(svg, e.clientX, e.clientY)
}

const onNewLinkPointerUp = async (e) => {
  const d = newLinkDrag.value
  if (!d || e.pointerId !== d.pointerId) return
  const snapshot = { blockId: d.blockId, sourceId: d.sourceId }
  clearNewLinkState(e)

  const sourceBlock = blocks.value.find((b) => String(b.id) === String(snapshot.blockId))
  if (!sourceBlock) return

  const targetHit = findTaskBarUnderPoint(e.clientX, e.clientY)
  if (!targetHit?.taskId || !targetHit?.blockId) return
  if (String(targetHit.taskId) === String(snapshot.sourceId) && String(targetHit.blockId) === String(snapshot.blockId)) return

  const targetBlock = blocks.value.find((b) => String(b.id) === String(targetHit.blockId))
  if (!targetBlock) return

  // Сохраняем состояние линий связи задач до добавления зависимости (отменяется кнопкой ↩️).
  lastManualGanttEditSnapshot.value = {
    type: 'dependency',
    at: Date.now(),
    scope: 'task',
    blockId: String(targetBlock.id),
    tasks: (targetBlock.tasks || [])
      .filter((t) => t?.id !== null && t?.id !== undefined && String(t.id).trim() !== '')
      .map((t) => ({
        taskId: String(t.id),
        predecessorIds: normalizePredecessorIds(t.predecessorIds),
        predecessorLinks: Array.isArray(t.predecessorLinks) ? t.predecessorLinks : []
      }))
  }

  if (String(targetBlock.id) === String(sourceBlock.id)) {
    const updated = applyAddPredecessor(targetBlock, targetHit.taskId, snapshot.sourceId)
    if (updated) {
      const res = await updateBlock(updated)
      if (!res.success) {
        lastManualGanttEditSnapshot.value = null
        showNotificationMessage('Не удалось сохранить связь', 'error')
      }
    } else {
      const succTask = getTasksByOrder(targetBlock).find((t) => String(t.id) === String(targetHit.taskId))
      if (succTask && getTaskDependencyLinks(succTask).some((dep) => String(dep.predId) === String(snapshot.sourceId))) {
        lastManualGanttEditSnapshot.value = null
        showNotificationMessage('Такая связь уже есть', 'warning')
      } else {
        lastManualGanttEditSnapshot.value = null
        showNotificationMessage('Нельзя добавить связь (цикл)', 'warning')
      }
      return
    }
  } else {
    const succTask = (targetBlock.tasks || []).find((t) => String(t.id) === String(targetHit.taskId))
    if (!succTask) return
    const succDeps = getTaskDependencyLinks(succTask)
    if (succDeps.some((dep) => String(dep.predId) === String(snapshot.sourceId))) {
      lastManualGanttEditSnapshot.value = null
      showNotificationMessage('Такая связь уже есть', 'warning')
      return
    }
    const nextLinks = [...succDeps, { predId: String(snapshot.sourceId), type: 'FS', lagDays: 0 }]
    succTask.predecessorLinks = nextLinks
    succTask.predecessorIds = normalizePredecessorIds(nextLinks.map((dep) => String(dep.predId)))
    const res = await updateBlock({
      ...targetBlock,
      tasks: (targetBlock.tasks || []).map((t) =>
        String(t.id) === String(succTask.id) ? { ...succTask } : t
      )
    })
    if (!res.success) {
      lastManualGanttEditSnapshot.value = null
      showNotificationMessage('Не удалось сохранить связь', 'error')
    }
  }
}

const onNewLinkPointerCancel = (e) => {
  const d = newLinkDrag.value
  if (!d || e.pointerId !== d.pointerId) return
  clearNewLinkState(e)
}

const normalizeStagePredecessorIds = (raw) => {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const id of raw) {
    if (id === null || id === undefined || id === '') continue
    const key = String(id)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(id)
  }
  return out
}

const STAGE_DEP_STORAGE_KEY = 'put-roadmap.gantt.stagePredecessorIds.v1'

const readStageDepStorage = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {}
    const raw = window.localStorage.getItem(STAGE_DEP_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out = {}
    for (const [k, v] of Object.entries(parsed)) {
      out[String(k)] = normalizeStagePredecessorIds(v)
    }
    return out
  } catch {
    return {}
  }
}

const stageDepStorage = ref(readStageDepStorage())

const writeStageDepStorage = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(STAGE_DEP_STORAGE_KEY, JSON.stringify(stageDepStorage.value))
  } catch {
    /* ignore */
  }
}

const STAGE_DEP_LABELS_KEY = 'put-roadmap.gantt.stageDependencyLabels.v1'

const getStageLabelKey = (fromId, toId) => `${String(fromId)}>${String(toId)}`

const readStageDepLabels = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {}
    const raw = window.localStorage.getItem(STAGE_DEP_LABELS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || typeof v !== 'object') continue
      out[String(k)] = {
        text: typeof v.text === 'string' ? v.text : '',
        kind: ['comment', 'checkpoint', 'date'].includes(v.kind) ? v.kind : 'comment',
        dateStr: typeof v.dateStr === 'string' ? v.dateStr : ''
      }
    }
    return out
  } catch {
    return {}
  }
}

const stageDepLabels = ref(readStageDepLabels())

const writeStageDepLabels = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(STAGE_DEP_LABELS_KEY, JSON.stringify(stageDepLabels.value))
  } catch {
    /* ignore */
  }
}

const stageLabelEditor = ref(null)
const taskDepEditor = ref(null)
const stageLabelTooltip = ref(null)
const stagePathHintTooltip = ref(null)
const stageBarTooltip = ref(null)
let stageEdgeClickTimer = null
let taskEdgeClickTimer = null

const stageLabelPopoverLeft = computed(() => stageLabelEditor.value?.popoverLeft ?? 0)
const stageLabelPopoverTop = computed(() => stageLabelEditor.value?.popoverTop ?? 0)
const taskDepPopoverLeft = computed(() => taskDepEditor.value?.popoverLeft ?? 0)
const taskDepPopoverTop = computed(() => taskDepEditor.value?.popoverTop ?? 0)

const clampStageLabelPopoverPosition = (clientX, clientY) => {
  const POP_W = 300
  const POP_H = 280
  const pad = 10
  let left = clientX + 12
  let top = clientY + 12
  if (left + POP_W > window.innerWidth) left = Math.max(pad, window.innerWidth - POP_W - pad)
  if (top + POP_H > window.innerHeight) top = Math.max(pad, window.innerHeight - POP_H - pad)
  return { popoverLeft: left, popoverTop: top }
}

const clampTaskDepPopoverPosition = (clientX, clientY) => {
  const POP_W = 290
  const POP_H = 220
  const pad = 10
  let left = clientX + 12
  let top = clientY + 12
  if (left + POP_W > window.innerWidth) left = Math.max(pad, window.innerWidth - POP_W - pad)
  if (top + POP_H > window.innerHeight) top = Math.max(pad, window.innerHeight - POP_H - pad)
  return { popoverLeft: left, popoverTop: top }
}

const closeTaskDepEditor = () => {
  taskDepEditor.value = null
}

const openTaskDepEditor = (e, seg) => {
  if (readOnly.value) return
  const succBlock = blocks.value.find((b) => String(b.id) === String(seg.blockId))
  if (!succBlock) return
  const succTask = (succBlock.tasks || []).find((t) => String(t.id) === String(seg.succId))
  if (!succTask) return
  const dep = getTaskDependencyLinks(succTask).find((d) => String(d.predId) === String(seg.predId))
  if (!dep) return
  taskDepEditor.value = {
    blockId: String(seg.blockId),
    predId: String(seg.predId),
    succId: String(seg.succId),
    type: normalizeDependencyType(dep.type),
    lagDays: normalizeLagDays(dep.lagDays),
    ...clampTaskDepPopoverPosition(e.clientX, e.clientY)
  }
}

const saveTaskDepEditor = async () => {
  if (readOnly.value) return
  const ed = taskDepEditor.value
  if (!ed) return
  const succBlock = blocks.value.find((b) => String(b.id) === String(ed.blockId))
  if (!succBlock) return
  const succTask = (succBlock.tasks || []).find((t) => String(t.id) === String(ed.succId))
  if (!succTask) return
  const deps = getTaskDependencyLinks(succTask)
  const depIdx = deps.findIndex((d) => String(d.predId) === String(ed.predId))
  if (depIdx < 0) return
  deps[depIdx] = {
    predId: String(ed.predId),
    type: normalizeDependencyType(ed.type),
    lagDays: normalizeLagDays(ed.lagDays)
  }
  succTask.predecessorLinks = deps
  succTask.predecessorIds = normalizePredecessorIds(deps.map((d) => String(d.predId)))
  const tasks = (succBlock.tasks || []).map((t) =>
    String(t.id) === String(succTask.id)
      ? {
        ...t,
        predecessorLinks: deps,
        predecessorIds: normalizePredecessorIds(deps.map((d) => String(d.predId)))
      }
      : t
  )
  const res = await updateBlock({ ...succBlock, tasks })
  if (!res?.success) {
    showNotificationMessage('Не удалось сохранить связь задач', 'error')
    return
  }
  closeTaskDepEditor()
}

const formatStageDepLabelTooltip = (label) => {
  if (!label) return ''
  const parts = []
  if (label.kind === 'checkpoint') parts.push('Чекпоинт')
  if (label.kind === 'date' || label.dateStr) {
    if (label.dateStr) parts.push(`Дата: ${label.dateStr}`)
  }
  const t = (label.text || '').trim()
  if (t) parts.push(t)
  return parts.length ? parts.join('\n') : ''
}

const stageDepLabelHasContent = (label) => {
  if (!label) return false
  if ((label.text || '').trim()) return true
  if ((label.dateStr || '').trim()) return true
  return false
}

const closeStageLabelEditor = () => {
  stageLabelEditor.value = null
}

const openStageLabelEditor = (e, seg) => {
  if (readOnly.value) return
  const labelKey = getStageLabelKey(seg.fromBlockId, seg.toBlockId)
  const exist = stageDepLabels.value[labelKey] || {}
  stageLabelEditor.value = {
    labelKey,
    fromBlockId: seg.fromBlockId,
    toBlockId: seg.toBlockId,
    text: exist.text || '',
    kind: exist.kind || 'comment',
    dateStr: exist.dateStr || '',
    ...clampStageLabelPopoverPosition(e.clientX, e.clientY)
  }
}

const saveStageLabelEditor = () => {
  if (readOnly.value) return
  const ed = stageLabelEditor.value
  if (!ed) return
  const text = (ed.text || '').trim()
  const dateStr = (ed.dateStr || '').trim()
  const nextMap = { ...stageDepLabels.value }
  if (!text && !dateStr) {
    delete nextMap[ed.labelKey]
  } else {
    nextMap[ed.labelKey] = { text, kind: ed.kind, dateStr }
  }
  stageDepLabels.value = nextMap
  writeStageDepLabels()
  closeStageLabelEditor()
}

const onStageDepPathClick = (e, seg) => {
  if (readOnly.value) return
  stagePathHintTooltip.value = null
  clearTimeout(stageEdgeClickTimer)
  stageEdgeClickTimer = setTimeout(() => {
    openStageLabelEditor(e, seg)
    stageEdgeClickTimer = null
  }, 280)
}

const onStageDepPathDblClick = (e, seg) => {
  if (readOnly.value) return
  stagePathHintTooltip.value = null
  clearTimeout(stageEdgeClickTimer)
  stageEdgeClickTimer = null
  removeStageDependency(seg)
}

const buildStageTooltipPosition = (clientX, clientY, maxW = 280, maxH = 120) => {
  const pad = 12
  let x = clientX + pad
  let y = clientY + pad
  if (x + maxW > window.innerWidth) x = Math.max(8, window.innerWidth - maxW - 8)
  if (y + maxH > window.innerHeight) y = Math.max(8, clientY - maxH)
  return { x, y }
}

const onStageDepMarkerEnter = (e, seg) => {
  stagePathHintTooltip.value = null
  const labelKey = getStageLabelKey(seg.fromBlockId, seg.toBlockId)
  const label = stageDepLabels.value[labelKey]
  if (!stageDepLabelHasContent(label)) return
  const text = formatStageDepLabelTooltip(label)
  if (!text) return
  const pos = buildStageTooltipPosition(e.clientX, e.clientY, 280, 120)
  stageLabelTooltip.value = { ...pos, text }
}

const onStageDepMarkerLeave = () => {
  stageLabelTooltip.value = null
}

const onStageDepPathHintEnter = (e) => {
  const text = 'Один клик — заметка к связи\nДвойной клик — удалить связь'
  const pos = buildStageTooltipPosition(e.clientX, e.clientY, 300, 120)
  stagePathHintTooltip.value = { ...pos, text }
}

const onStageDepPathHintMove = (e) => {
  if (!stagePathHintTooltip.value) return
  const pos = buildStageTooltipPosition(e.clientX, e.clientY, 300, 120)
  stagePathHintTooltip.value = { ...stagePathHintTooltip.value, ...pos }
}

const onStageDepPathHintLeave = () => {
  stagePathHintTooltip.value = null
}

const onStageBarTooltipEnter = (e, block) => {
  if (!block) return
  const text = `${block.title}\n${formatDate(block.startDate)} — ${formatDate(block.releaseDate)}\nСтатус: ${getGanttStatusLabel(block)}\nПрогресс: ${getTaskProgress(block)}%`
  const pos = buildStageTooltipPosition(e.clientX, e.clientY, 320, 140)
  stageBarTooltip.value = { ...pos, text }
}

const onStageBarTooltipMove = (e) => {
  if (!stageBarTooltip.value) return
  const pos = buildStageTooltipPosition(e.clientX, e.clientY, 320, 140)
  stageBarTooltip.value = { ...stageBarTooltip.value, ...pos }
}

const onStageBarTooltipLeave = () => {
  stageBarTooltip.value = null
}

const onDocumentMousedownStageLabel = (e) => {
  const el = e.target
  if (typeof el?.closest === 'function' && el.closest('.stage-dep-label-popover')) return
  if (stageLabelEditor.value) closeStageLabelEditor()
  if (taskDepEditor.value) closeTaskDepEditor()
}

onMounted(() => {
  setScaleMode('day')
  document.addEventListener('mousedown', onDocumentMousedownStageLabel)
})

const getStagePredIds = (block) => {
  const fromBlock = normalizeStagePredecessorIds(block?.stagePredecessorIds)
  if (fromBlock.length) return fromBlock
  return normalizeStagePredecessorIds(stageDepStorage.value[String(block?.id)])
}

const wouldCreateStageCycle = (sourceId, targetId) => {
  const sourceKey = String(sourceId)
  const targetKey = String(targetId)
  if (sourceKey === targetKey) return true

  const edges = new Map()
  for (const b of blocks.value) {
    const succKey = String(b.id)
    for (const pred of getStagePredIds(b)) {
      const predKey = String(pred)
      if (!edges.has(predKey)) edges.set(predKey, new Set())
      edges.get(predKey).add(succKey)
    }
  }
  if (!edges.has(sourceKey)) edges.set(sourceKey, new Set())
  edges.get(sourceKey).add(targetKey)

  const stack = [targetKey]
  const visited = new Set()
  while (stack.length) {
    const cur = stack.pop()
    if (cur === sourceKey) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    for (const nx of edges.get(cur) || []) stack.push(nx)
  }
  return false
}

const getStageAnchor = (block, rowOffset, side) => {
  const stageStyle = getBarStyleWithPreview(block) || {}
  const left = typeof stageStyle.left === 'string' ? parseFloat(stageStyle.left) : NaN
  const width = typeof stageStyle.width === 'string' ? parseFloat(stageStyle.width) : NaN
  if (!Number.isFinite(left) || !Number.isFinite(width) || width <= 0) return null
  const x = side === 'right' ? left + width : (side === 'center' ? left + width * 0.5 : left)
  const y = rowOffset + STAGE_MAIN_BAR_TOP + STAGE_MAIN_BAR_HEIGHT / 2
  return { x, y }
}

const buildOrthogonalDependencyPath = (x1, y1, x2, y2, detourX = null, fromSide = 'right', toSide = 'left') => {
  const dx = x2 - x1
  const dy = y2 - y1
  const defaultDetour = Math.max(x1, x2) + 22
  const elbowX = Number.isFinite(detourX) ? Number(detourX) : defaultDetour
  if (Math.abs(dy) < 0.001) {
    const dStraight = `M ${x1} ${y1} L ${x2} ${y2}`
    return { d: dStraight, mx: x1 + dx * 0.5, my: y1 + dy * 0.5 }
  }
  const baseRadius = 7
  const hDir1 = Math.sign(elbowX - x1) || 1
  const hDir2 = Math.sign(x2 - elbowX) || -1
  const vDir = Math.sign(y2 - y1) || 1
  const r1 = Math.min(baseRadius, Math.abs(elbowX - x1) * 0.5, Math.abs(y2 - y1) * 0.5)
  const r2 = Math.min(baseRadius, Math.abs(x2 - elbowX) * 0.5, Math.abs(y2 - y1) * 0.5)
  const p1x = elbowX - hDir1 * r1
  const p1y = y1
  const p2x = elbowX
  const p2y = y1 + vDir * r1
  const p3x = elbowX
  const p3y = y2 - vDir * r2
  const p4x = elbowX + hDir2 * r2
  const p4y = y2
  const d = [
    `M ${x1} ${y1}`,
    `L ${p1x} ${p1y}`,
    `Q ${elbowX} ${y1} ${p2x} ${p2y}`,
    `L ${p3x} ${p3y}`,
    `Q ${elbowX} ${y2} ${p4x} ${p4y}`,
    `L ${x2} ${y2}`
  ].join(' ')
  return { d, mx: elbowX, my: y1 + dy * 0.5 }
}

const buildSineDependencyPath = (x1, y1, x2, y2, laneOffset = 0) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const absDx = Math.abs(dx)
  const dirX = dx >= 0 ? 1 : -1
  const leadOut = Math.min(34 + Math.abs(laneOffset), Math.max(10, absDx * 0.45))
  const xStartWave = x1 + dirX * leadOut
  const amplitudeBase = Math.max(6, Math.min(18, Math.abs(dy) * 0.33 + 7))
  const amplitude = amplitudeBase + Math.min(10, Math.abs(laneOffset) * 0.35)
  const waves = absDx > 120 ? 2 : 1
  const steps = Math.max(14, waves * 14)
  const points = []
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    const x = xStartWave + (x2 - xStartWave) * t
    const baseY = y1 + dy * t
    const y = baseY + Math.sin(t * Math.PI * waves) * amplitude
    points.push({ x, y })
  }
  let d = `M ${x1} ${y1} L ${xStartWave} ${y1}`
  if (!points.length) {
    d += ` L ${x2} ${y2}`
    return { d, mx: x1 + dx * 0.5, my: y1 + dy * 0.5 }
  }
  if (points.length === 1) {
    d += ` L ${points[0].x} ${points[0].y}`
    return { d, mx: x1 + dx * 0.5, my: y1 + dy * 0.5 }
  }
  d += ` L ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i]
    const next = points[i + 1]
    const midX = (p.x + next.x) * 0.5
    const midY = (p.y + next.y) * 0.5
    d += ` Q ${p.x} ${p.y} ${midX} ${midY}`
  }
  const penultimate = points[points.length - 2]
  const last = points[points.length - 1]
  d += ` Q ${penultimate.x} ${penultimate.y} ${last.x} ${last.y}`
  return { d, mx: x1 + dx * 0.5, my: y1 + dy * 0.5 }
}

const buildFsDependencyPath = (x1, y1, x2, y2, lagDays = 0, laneOffset = 0) => {
  const gap = 10
  const entryTail = 0
  const lagPx = (Number(lagDays) || 0) * Number(dayWidth.value || 0)
  const targetX = x2 + lagPx
  const entryX = targetX - entryTail
  const outX = x1 + gap + Math.max(0, laneOffset)
  const inX = targetX - gap
  const elbowX = Math.max(outX, inX, x1 + gap)
  const dx = targetX - x1
  const dy = y2 - y1
  if (Math.abs(dy) < 0.001) {
    return { d: `M ${x1} ${y1} L ${targetX} ${y2}`, mx: x1 + dx * 0.5, my: y1 }
  }
  const vDir = Math.sign(y2 - y1) || 1
  const radius = Math.min(6, Math.max(2, Math.abs(dy) * 0.25), Math.max(2, Math.abs(targetX - x1) * 0.12))
  const p1x = elbowX - radius
  const p1y = y1
  const p2x = elbowX
  const p2y = y1 + vDir * radius
  const p3x = elbowX
  const p3y = y2 - vDir * radius
  const p4x = Math.min(elbowX + radius, entryX - 0.4)
  const p4y = y2
  const d = [
    `M ${x1} ${y1}`,
    `L ${p1x} ${p1y}`,
    `Q ${elbowX} ${y1} ${p2x} ${p2y}`,
    `L ${p3x} ${p3y}`,
    `Q ${elbowX} ${y2} ${p4x} ${p4y}`,
    `L ${entryX} ${y2}`,
    `L ${targetX} ${y2}`
  ].join(' ')
  return { d, mx: elbowX, my: y1 + dy * 0.5 }
}

const segmentIntersectsInflatedRect = (x1, y1, x2, y2, rect, pad = 0) => {
  if (!rect) return false
  const rx1 = rect.x - pad
  const rx2 = rect.x + rect.w + pad
  const ry1 = rect.y - pad
  const ry2 = rect.y + rect.h + pad
  if (Math.abs(y1 - y2) < 0.001) {
    const y = y1
    if (y < ry1 || y > ry2) return false
    const sx1 = Math.min(x1, x2)
    const sx2 = Math.max(x1, x2)
    return sx2 >= rx1 && sx1 <= rx2
  }
  if (Math.abs(x1 - x2) < 0.001) {
    const x = x1
    if (x < rx1 || x > rx2) return false
    const sy1 = Math.min(y1, y2)
    const sy2 = Math.max(y1, y2)
    return sy2 >= ry1 && sy1 <= ry2
  }
  return false
}

const fsRouteHitsObstacles = (x1, y1, x2, y2, lagDays, laneOffset, obstacles, pad = 1) => {
  const gap = 10
  const lagPx = (Number(lagDays) || 0) * Number(dayWidth.value || 0)
  const targetX = x2 + lagPx
  const outX = x1 + gap + Math.max(0, laneOffset)
  const inX = targetX - gap
  const elbowX = Math.max(outX, inX, x1 + gap)
  const segments = [
    [x1, y1, elbowX, y1],
    [elbowX, y1, elbowX, y2],
    [elbowX, y2, targetX, y2]
  ]
  for (const rect of (obstacles || [])) {
    for (const seg of segments) {
      if (segmentIntersectsInflatedRect(seg[0], seg[1], seg[2], seg[3], rect, pad)) return true
    }
  }
  return false
}

const buildFsBypassAbovePath = (x1, y1, targetX, y2, obstacles, laneOffset = 0) => {
  const gap = 10
  const deltaY = y2 - y1
  const dirY = Math.sign(deltaY) || 1
  const minBend = 8 + Math.max(0, Math.min(10, laneOffset * 0.4))
  const middleY = y1 + deltaY * 0.5
  const bypassY = Math.abs(deltaY) <= minBend * 2
    ? y1 + dirY * minBend
    : middleY
  const viaStartX = x1 + gap
  const viaEndX = targetX - gap
  const r = 5
  const v1 = bypassY >= y1 ? 1 : -1
  const v2 = y2 >= bypassY ? 1 : -1
  const hDir = Math.sign(viaEndX - viaStartX) || 1
  const hToTarget = Math.sign(targetX - viaEndX) || 0
  const d = [
    `M ${x1} ${y1}`,
    `L ${viaStartX - r} ${y1}`,
    `Q ${viaStartX} ${y1} ${viaStartX} ${y1 + v1 * r}`,
    `L ${viaStartX} ${bypassY - v1 * r}`,
    `Q ${viaStartX} ${bypassY} ${viaStartX + hDir * r} ${bypassY}`,
    `L ${viaEndX - hDir * r} ${bypassY}`,
    `Q ${viaEndX} ${bypassY} ${viaEndX} ${bypassY + v2 * r}`,
    `L ${viaEndX} ${y2 - v2 * r}`,
    ...(hToTarget
      ? [`Q ${viaEndX} ${y2} ${viaEndX + hToTarget * r} ${y2}`, `L ${targetX} ${y2}`]
      : [`L ${targetX} ${y2}`])
  ].join(' ')
  return { d, mx: (viaStartX + viaEndX) * 0.5, my: bypassY }
}

const buildStageDependencyPath = (x1, y1, x2, y2, laneOffset = 0) => {
  const gap = 10
  const entryTail = 1.5
  const entryX = x2 - entryTail
  const outX = x1 + gap + Math.max(0, laneOffset)
  const inX = x2 - gap
  const elbowX = Math.max(outX, inX, x1 + gap)
  const dx = x2 - x1
  const dy = y2 - y1
  if (Math.abs(dy) < 0.001) {
    return { d: `M ${x1} ${y1} L ${x2} ${y2}`, mx: x1 + dx * 0.5, my: y1 }
  }
  const vDir = Math.sign(y2 - y1) || 1
  const radius = Math.min(6, Math.max(2, Math.abs(dy) * 0.25), Math.max(2, Math.abs(x2 - x1) * 0.12))
  const p1x = elbowX - radius
  const p1y = y1
  const p2x = elbowX
  const p2y = y1 + vDir * radius
  const p3x = elbowX
  const p3y = y2 - vDir * radius
  const p4x = Math.min(elbowX + radius, entryX - 0.4)
  const p4y = y2
  const d = [
    `M ${x1} ${y1}`,
    `L ${p1x} ${p1y}`,
    `Q ${elbowX} ${y1} ${p2x} ${p2y}`,
    `L ${p3x} ${p3y}`,
    `Q ${elbowX} ${y2} ${p4x} ${p4y}`,
    `L ${entryX} ${y2}`,
    `L ${x2} ${y2}`
  ].join(' ')
  return { d, mx: elbowX, my: y1 + dy * 0.5 }
}

const collectStageDependencyObstacles = (sourceBlockId, targetBlockId, rowOffsetById) => {
  const obstacles = []
  for (const block of (filteredGanttBlocks.value || [])) {
    const blockId = String(block.id)
    if (blockId === String(sourceBlockId) || blockId === String(targetBlockId)) continue
    const rowOffset = rowOffsetById.get(blockId) || 0
    const rect = getStageMainBarRectGlobal(block, rowOffset)
    if (rect) obstacles.push(rect)
  }
  return obstacles
}

const stageDependencyEdges = computed(() => {
  const out = []
  const sourceLaneCounters = new Map()
  const targetLaneCounters = new Map()
  const visible = filteredGanttBlocks.value || []
  const idToBlock = new Map(visible.map((b) => [String(b.id), b]))
  const rowOffsetById = new Map()
  let rowOffset = 0
  for (const block of visible) {
    rowOffsetById.set(String(block.id), rowOffset)
    rowOffset += getStageWrapperHeight(block)
  }

  for (const succ of visible) {
    const succId = String(succ.id)
    const succOffset = rowOffsetById.get(succId) || 0
    const succAnchor = getStageAnchor(succ, succOffset, 'left')
    if (!succAnchor) continue
    const predIds = getStagePredIds(succ)
    for (const pid of predIds) {
      const predId = String(pid)
      const pred = idToBlock.get(predId)
      if (!pred || predId === succId) continue
      const predOffset = rowOffsetById.get(predId) || 0
      const predAnchor = getStageAnchor(pred, predOffset, 'right')
      if (!predAnchor) continue
      const sourceKey = `${predId}:${Math.round(predAnchor.x)}:${Math.round(predAnchor.y)}`
      const sourceLane = sourceLaneCounters.get(sourceKey) || 0
      sourceLaneCounters.set(sourceKey, sourceLane + 1)
      const targetKey = `${succId}:${Math.round(succAnchor.x)}:${Math.round(succAnchor.y)}`
      const targetLane = targetLaneCounters.get(targetKey) || 0
      targetLaneCounters.set(targetKey, targetLane + 1)
      const laneOffset = sourceLane * 10 + targetLane * 8
      const x1 = predAnchor.x
      const y1 = predAnchor.y
      const x2 = succAnchor.x
      const y2 = succAnchor.y
      const obstacles = collectStageDependencyObstacles(predId, succId, rowOffsetById)
      const preferBetweenStageBars = Math.abs(y2 - y1) > (STAGE_MAIN_BAR_HEIGHT + 2)
      const needsBypass = fsRouteHitsObstacles(x1, y1, x2, y2, 0, laneOffset, obstacles, 1.1)
      const path = (needsBypass || preferBetweenStageBars)
        ? buildFsBypassAbovePath(x1, y1, x2, y2, obstacles, laneOffset)
        : buildFsDependencyPath(x1, y1, x2, y2, 0, laneOffset)
      const labelKey = getStageLabelKey(pred.id, succ.id)
      const sl = stageDepLabels.value[labelKey]
      out.push({
        key: `stage-${pred.id}->${succ.id}`,
        d: path.d,
        mx: path.mx,
        my: path.my,
        x1,
        y1,
        x2,
        y2,
        fromBlockId: pred.id,
        toBlockId: succ.id,
        markerEnd: 'url(#gantt-dep-arr-stage)',
        labelKey,
        hasLabel: stageDepLabelHasContent(sl)
      })
    }
  }

  return out
})

const onStageLinkPointerDown = (e, block) => {
  if (readOnly.value) return
  if (e.button !== 0) return
  const rowY = getBlockRowOffsetY(block)
  const anchor = getStageAnchor(block, rowY, 'right')
  if (!anchor) return
  const svg = ganttDepsSvg.value
  stageLinkPointer.value = svg ? clientToSvgCoords(svg, e.clientX, e.clientY) : { x: 0, y: 0 }
  stageLinkDrag.value = {
    sourceBlockId: block.id,
    anchorX: anchor.x,
    anchorY: anchor.y,
    pointerId: e.pointerId,
    captureEl: e.currentTarget
  }
  e.currentTarget.setPointerCapture(e.pointerId)
  document.body.classList.add('is-dep-link-drag')
}

const onStageLinkPointerMove = (e) => {
  const d = stageLinkDrag.value
  if (!d || e.pointerId !== d.pointerId) return
  const svg = ganttDepsSvg.value
  if (!svg) return
  stageLinkPointer.value = clientToSvgCoords(svg, e.clientX, e.clientY)
}

const onStageLinkPointerUp = async (e) => {
  const d = stageLinkDrag.value
  if (!d || e.pointerId !== d.pointerId) return
  const sourceBlockId = d.sourceBlockId
  clearStageLinkState(e)

  const svg = ganttDepsSvg.value
  if (!svg) return
  const p = clientToSvgCoords(svg, e.clientX, e.clientY)
  const targetIdStr = findStageBySvgPoint(p.y, sourceBlockId)
  if (!targetIdStr) return

  const source = blocks.value.find((b) => String(b.id) === String(sourceBlockId))
  const target = blocks.value.find((b) => String(b.id) === targetIdStr)
  if (!source || !target || String(source.id) === String(target.id)) return

  lastManualGanttEditSnapshot.value = {
    type: 'dependency',
    at: Date.now(),
    scope: 'stage',
    succBlockId: String(target.id),
    prevStagePredecessorIds: normalizeStagePredecessorIds(target.stagePredecessorIds),
    prevStageDepStorage: JSON.parse(JSON.stringify(stageDepStorage.value || {})),
    prevStageDepLabels: JSON.parse(JSON.stringify(stageDepLabels.value || {}))
  }

  const current = normalizeStagePredecessorIds(target.stagePredecessorIds)
  if (!current.length) {
    const fallback = normalizeStagePredecessorIds(stageDepStorage.value[String(target.id)])
    if (fallback.length) {
      current.push(...fallback)
    }
  }
  if (current.some((id) => String(id) === String(source.id))) {
    lastManualGanttEditSnapshot.value = null
    showNotificationMessage('Такая связь этапов уже есть', 'warning')
    return
  }
  if (wouldCreateStageCycle(source.id, target.id)) {
    lastManualGanttEditSnapshot.value = null
    showNotificationMessage('Нельзя добавить связь этапов (цикл)', 'warning')
    return
  }

  const updated = {
    ...target,
    stagePredecessorIds: [...current, source.id]
  }
  stageDepStorage.value[String(target.id)] = normalizeStagePredecessorIds(updated.stagePredecessorIds)
  writeStageDepStorage()
  const res = await updateBlock(updated)
  if (!res.success) {
    lastManualGanttEditSnapshot.value = null
    showNotificationMessage('Не удалось сохранить связь этапов', 'error')
  }
}

const onStageLinkPointerCancel = (e) => {
  const d = stageLinkDrag.value
  if (!d || e.pointerId !== d.pointerId) return
  clearStageLinkState(e)
}

const removeStageDependency = async (edge) => {
  if (readOnly.value) return
  const succ = blocks.value.find((b) => String(b.id) === String(edge.toBlockId))
  if (!succ) return

  lastManualGanttEditSnapshot.value = {
    type: 'dependency',
    at: Date.now(),
    scope: 'stage',
    succBlockId: String(succ.id),
    prevStagePredecessorIds: normalizeStagePredecessorIds(succ.stagePredecessorIds),
    prevStageDepStorage: JSON.parse(JSON.stringify(stageDepStorage.value || {})),
    prevStageDepLabels: JSON.parse(JSON.stringify(stageDepLabels.value || {}))
  }

  const lk = getStageLabelKey(edge.fromBlockId, edge.toBlockId)
  if (stageDepLabels.value[lk]) {
    const nextLabels = { ...stageDepLabels.value }
    delete nextLabels[lk]
    stageDepLabels.value = nextLabels
    writeStageDepLabels()
  }

  const nextPreds = getStagePredIds(succ)
    .filter((id) => String(id) !== String(edge.fromBlockId))

  const updated = {
    ...succ,
    stagePredecessorIds: nextPreds
  }
  stageDepStorage.value[String(succ.id)] = normalizeStagePredecessorIds(nextPreds)
  writeStageDepStorage()

  const res = await updateBlock(updated)
  if (!res.success) {
    lastManualGanttEditSnapshot.value = null
    showNotificationMessage('Не удалось удалить связь этапов', 'error')
  }
}

/** Совпадает с .task-bar (высота полосы этапа на таймлайне). */
const STAGE_MAIN_BAR_TOP = 15
const STAGE_MAIN_BAR_HEIGHT = 25

const cubicBezierPoint = (p0, p1, p2, p3, t) => {
  const u = 1 - t
  const uu = u * u
  const tt = t * t
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y
  }
}

const pointInInflatedRect = (px, py, r, pad) => {
  return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad
}

const bezierHitsObstacles = (p0, p1, p2, p3, obstacles, pad, t0, t1, steps) => {
  for (let s = 0; s <= steps; s++) {
    const t = t0 + ((t1 - t0) * s) / steps
    const pt = cubicBezierPoint(p0, p1, p2, p3, t)
    for (let o = 0; o < obstacles.length; o++) {
      if (pointInInflatedRect(pt.x, pt.y, obstacles[o], pad)) return true
    }
  }
  return false
}

const getStageMainBarRectGlobal = (block, rowOffset) => {
  const stageStyle = getBarStyleWithPreview(block) || {}
  const left = typeof stageStyle.left === 'string' ? parseFloat(stageStyle.left) : NaN
  const width = typeof stageStyle.width === 'string' ? parseFloat(stageStyle.width) : NaN
  if (!Number.isFinite(left) || !Number.isFinite(width) || width <= 0) return null
  return {
    x: left,
    y: rowOffset + STAGE_MAIN_BAR_TOP,
    w: width,
    h: STAGE_MAIN_BAR_HEIGHT
  }
}

/**
 * Препятствия: полоса этапа + сегменты задач.
 * У концов связи учитываем только часть полосы слева от выхода / справа от входа,
 * чтобы линия не резала собственные прямоугольники задач.
 */
const collectDependencyObstacles = (block, rowOffset, i, j, x1, x2) => {
  const obs = []
  const main = getStageMainBarRectGlobal(block, rowOffset)
  if (main) obs.push(main)
  const tasks = getSortedBlockTasks(block)
  const n = tasks.length
  const gap = 5
  for (let k = 0; k < n; k++) {
    const layout = getTaskBarLayout(block, k)
    if (!layout) continue
    const gy = rowOffset + layout.top
    const right = layout.left + layout.width
    if (k === i) {
      const w = x1 - layout.left - gap
      if (w > 2) obs.push({ x: layout.left, y: gy, w, h: layout.height })
      continue
    }
    if (k === j) {
      const w = right - x2 - gap
      if (w > 2) obs.push({ x: x2 + gap, y: gy, w, h: layout.height })
      continue
    }
    obs.push({ x: layout.left, y: gy, w: layout.width, h: layout.height })
  }
  return obs
}

/**
 * Кубическая Безье от правого якоря к левому, без прохода через чужие полосы
 * (с учётом зазора под толщину линии).
 */
const buildDependencyPathAvoidingBars = (x1, y1, x2, y2, obstacles, strokePad, fromSide = 'right', toSide = 'left', detourX = null) => {
  const list = Array.isArray(obstacles) ? obstacles : []
  const pad = Math.max(0, Number(strokePad) || 0)
  const yMin = Math.min(y1, y2) - pad
  const yMax = Math.max(y1, y2) + pad
  const baseDetourX = Number.isFinite(detourX)
    ? Number(detourX)
    : Math.max(x1, x2) + 22
  let avoidX = baseDetourX
  for (const r of list) {
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.w) || !Number.isFinite(r.h)) continue
    const ry1 = r.y - pad
    const ry2 = r.y + r.h + pad
    if (ry2 < yMin || ry1 > yMax) continue
    const right = r.x + r.w + pad + 8
    if (right > avoidX) avoidX = right
  }
  return buildOrthogonalDependencyPath(x1, y1, x2, y2, avoidX, fromSide, toSide).d
}

/** Связи задач всегда фиолетовые, как связи этапов. */
const dependencyStyleForSuccessor = () => ({
  stroke: 'rgba(54, 94, 116, 0.82)',
  markerEnd: null,
})

const getDependencySides = (typeRaw) => {
  const type = normalizeDependencyType(typeRaw)
  if (type === 'SS') return { from: 'left', to: 'left' }
  if (type === 'FF') return { from: 'right', to: 'right' }
  if (type === 'SF') return { from: 'left', to: 'right' }
  return { from: 'right', to: 'left' } // FS
}

let ganttDepsRaf = null
const flushGanttDependencyPaths = () => {
  const out = []
  const sourceLaneCounters = new Map()
  const targetLaneCounters = new Map()
  const taskRefsById = new Map()
  const rowOffsetByBlock = new Map()
  let rowOffset = 0
  for (const block of filteredGanttBlocks.value) {
    rowOffsetByBlock.set(String(block.id), rowOffset)
    if (isBlockExpanded(block.id) && block.tasks?.length) {
      const tasks = getSortedBlockTasks(block)
      tasks.forEach((task, idx) => {
        if (task?.id === null || task?.id === undefined || task?.id === '') return
        const key = String(task.id)
        if (!taskRefsById.has(key)) {
          taskRefsById.set(key, { block, task, taskIdx: idx, rowOffset })
        }
      })
    }
    rowOffset += getStageWrapperHeight(block)
  }

  for (const block of filteredGanttBlocks.value) {
    if (!isBlockExpanded(block.id) || !block.tasks?.length) continue
    const succTasks = getSortedBlockTasks(block)
    const succRowOffset = rowOffsetByBlock.get(String(block.id)) || 0
    succTasks.forEach((succTask, succIdx) => {
      for (const dep of getTaskDependencyLinks(succTask)) {
        const predRef = taskRefsById.get(String(dep.predId))
        if (!predRef) continue
        if (String(predRef.task.id) === String(succTask.id) && String(predRef.block.id) === String(block.id)) continue
        const depType = normalizeDependencyType(dep.type)
        const depLagDays = normalizeLagDays(dep.lagDays)
        const sides = getDependencySides(depType)
        const from = getTaskAnchor(predRef.block, predRef.taskIdx, sides.from)
        const to = getTaskAnchor(block, succIdx, sides.to)
        if (!from || !to) continue
        const x1 = from.x
        const y1 = predRef.rowOffset + from.y
        const x2 = to.x
        const y2 = succRowOffset + to.y
        const { stroke, markerEnd } = dependencyStyleForSuccessor(succTask)
        const isSameBlock = String(predRef.block.id) === String(block.id)
        const sourceKey = `${predRef.block.id}:${predRef.task.id}:${Math.round(x1)}:${Math.round(y1)}`
        const sourceLane = sourceLaneCounters.get(sourceKey) || 0
        sourceLaneCounters.set(sourceKey, sourceLane + 1)
        const targetKey = `${block.id}:${succTask.id}:${Math.round(x2)}:${Math.round(y2)}`
        const targetLane = targetLaneCounters.get(targetKey) || 0
        targetLaneCounters.set(targetKey, targetLane + 1)
        const laneOffset = sourceLane * 10 + targetLane * 8
        const detourX = Math.max(x1, x2) + 22 + laneOffset
        let d = ''
        if (depType === 'FS') {
          const lagPx = depLagDays * Number(dayWidth.value || 0)
          const targetX = x2 + lagPx
          const obstacles = isSameBlock
            ? collectDependencyObstacles(block, succRowOffset, predRef.taskIdx, succIdx, x1, targetX)
            : []
          const needsBypass = isSameBlock && fsRouteHitsObstacles(
            x1,
            y1,
            x2,
            y2,
            depLagDays,
            laneOffset,
            obstacles,
            1.1
          )
          d = needsBypass
            ? buildFsBypassAbovePath(x1, y1, targetX, y2, obstacles, laneOffset).d
            : buildFsDependencyPath(x1, y1, x2, y2, depLagDays, laneOffset).d
        } else {
          d = buildOrthogonalDependencyPath(x1, y1, x2, y2, detourX, sides.from, sides.to).d
        }
        out.push({
          key: `${predRef.block.id}:${predRef.task.id}->${block.id}:${succTask.id}`,
          d,
          stroke,
          markerEnd,
          predBlockId: predRef.block.id,
          blockId: block.id,
          predId: predRef.task.id,
          succId: succTask.id,
          x1,
          y1,
          x2,
          y2,
          depType,
          depLagDays,
        })
      }
    })
  }
  ganttDependencyEdges.value = out
}

const scheduleGanttDependencyPaths = () => {
  if (ganttDepsRaf !== null) cancelAnimationFrame(ganttDepsRaf)
  ganttDepsRaf = requestAnimationFrame(() => {
    ganttDepsRaf = null
    flushGanttDependencyPaths()
  })
}

watch(
  [
    filteredGanttBlocks,
    expandedBlockIds,
    showCriticalPath,
    criticalPathByBlock,
    dayWidth,
    timelineScrollTop,
    ganttPanelScrollLeft,
    dragging,
    dragPreview,
    taskBarDrag,
  ],
  () => {
    scheduleGanttDependencyPaths()
  },
  { deep: true, flush: 'post', immediate: true }
)

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocumentMousedownStageLabel)
  clearTimeout(stageEdgeClickTimer)
  clearTimeout(taskEdgeClickTimer)
  clearTaskBarDragState()
  if (ganttDepsRaf !== null) cancelAnimationFrame(ganttDepsRaf)
})

const emit = defineEmits(['edit-block'])

</script>

<style scoped>
/* Стили для Ганта из App.vue, адаптированные */
.gantt-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
  background: #f8fafc;
  font-family: Inter, "Segoe UI", Roboto, Arial, sans-serif;
  font-weight: 400;
}
.gantt-header {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 6px;
  background: white;
  padding: 4px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  min-height: 28px;
  gap: 8px;
}
.gantt-controls { display: flex; gap: 4px; flex-wrap: nowrap; }
.gantt-scale-controls { display: flex; gap: 6px; flex-wrap: wrap; }
.gantt-controls .btn,
.gantt-scale-controls .btn {
  background: #f8fafc;
  color: #334155;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  padding: 0;
  min-height: 33px;
  min-width: 33px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: all 0.18s ease;
}
.gantt-controls .btn:hover,
.gantt-scale-controls .btn:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
  transform: translateY(-1px);
}
.gantt-controls .btn.active,
.gantt-scale-controls .btn.active {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.14);
}
.gantt-controls .btn.btn-icon {
  font-size: 1.08rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.gantt-leveling-hint {
  font-size: 0.7rem;
  color: #334155;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  padding: 2px 8px;
  line-height: 1.35;
  white-space: nowrap;
}
.gantt-critical-hint {
  margin-left: auto;
  font-size: 0.7rem;
  color: #334155;
  background: #f8fafc;
  border: 1px solid #dbeafe;
  border-radius: 7px;
  padding: 2px 8px;
  line-height: 1.35;
  white-space: nowrap;
}
.gantt-container {
  flex: 1;
  display: flex;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  min-height: 0;
}
.gantt-sidebar {
  width: 320px;
  background: #f8fafc;
  border-right: 2px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar-header {
  height: 40px;
  padding: 0 10px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  font-weight: 500;
  color: #475569;
  text-transform: uppercase;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 20;
}
.sidebar-expand-all {
  margin-right: 6px;
}
.sidebar-header--day-scale {
  height: 76px;
  min-height: 76px;
}
.sidebar-tasks { flex: 1; overflow-y: auto; scrollbar-width: none; }
.sidebar-tasks::-webkit-scrollbar { width: 0px; height: 0px; }
.sidebar-task-row {
  padding: 5px 8px 5px 10px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.2s;
  min-height: 54px;
  height: 54px;
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  gap: 0;
  overflow: hidden;
  position: relative;
}
.sidebar-task-row:hover, .sidebar-task-row.hovered {
  background: #e2e8f0;
  box-shadow: inset 3px 0 0 #3b82f6;
}
.sidebar-task-row.critical-path-stage-row {
  box-shadow:
    inset 4px 0 0 #f97316,
    inset 0 0 0 1px rgba(249, 115, 22, 0.28);
  background: linear-gradient(90deg, rgba(255, 237, 213, 0.78) 0%, rgba(255, 255, 255, 0.96) 75%);
}
.sidebar-task-row.overdue-stage-row {
  box-shadow: inset 3px 0 0 rgba(239, 68, 68, 0.95);
  background: linear-gradient(90deg, rgba(254, 226, 226, 0.5) 0%, rgba(255, 255, 255, 0.92) 68%);
}
.task-info { display: flex; flex-direction: column; gap: 2px; width: 100%; }
.task-info .task-title { font-weight: 600; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task-info .task-dates { font-size: 0.65rem; color: #64748b; }
.task-info .task-gantt-meta { font-size: 0.65rem; color: #475569; }
.task-date-edit { display: flex; align-items: center; gap: 6px; }
.date-input {
  width: 92px;
  padding: 0 6px;
  height: 22px;
  font-size: 0.7rem;
  box-sizing: border-box;
}
.date-sep { color: #64748b; font-weight: 600; }

.stage-row-left {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.stage-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.stage-dates {
  font-size: 0.68rem;
  color: #64748b;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-row-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
  padding-top: 1px;
}
.sidebar-date-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 1px;
}
.sidebar-date-row--task {
  margin-left: 26px;
}
.sidebar-date-input {
  width: 98px;
  height: 18px;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 0 4px;
  font-size: 0.62rem;
  color: #64748b;
  background: rgba(148, 163, 184, 0.14);
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}
.sidebar-date-input:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.2);
  color: #475569;
}
.sidebar-date-input:focus:not(:disabled) {
  border-color: #93c5fd;
  background: #ffffff;
  color: #0f172a;
}
.sidebar-date-input:disabled {
  background: #f1f5f9;
  color: #64748b;
  cursor: default;
}
.sidebar-date-input--task {
  width: 92px;
  height: 16px;
  font-size: 0.58rem;
}
.sidebar-date-input--subtle::-webkit-calendar-picker-indicator {
  opacity: 0.28;
  transform: scale(0.78);
}
.sidebar-date-sep {
  color: #94a3b8;
  font-size: 0.65rem;
  font-weight: 500;
  line-height: 1;
}

.sidebar-task-row .task-title {
  font-weight: 500;
  color: #0f172a;
  font-size: 0.97rem;
  line-height: 1.3;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.sidebar-task-row .task-gantt-meta { font-size: 0.68rem; color: #475569; white-space: nowrap; max-width: 86px; overflow: hidden; text-overflow: ellipsis; }

.stage-caret {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
  margin-top: 1px;
  color: #2563eb;
}
.stage-caret:hover {
  background: rgba(37, 99, 235, 0.08);
}
.stage-caret-icon {
  font-size: 1.45rem;
  font-weight: 600;
  line-height: 1;
  transform: rotate(0deg);
  transition: transform 0.16s ease;
}
.stage-caret-icon--expanded {
  transform: rotate(90deg);
}

.stage-reset-btn {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #1e3a8a;
  font-size: 0.95rem;
  cursor: pointer;
  flex-shrink: 0;
}
.stage-reset-btn:hover {
  background: rgba(30, 58, 138, 0.12);
}
.task-title--clickable {
  cursor: pointer;
}
.task-title--clickable:hover {
  text-decoration: underline;
}

.stage-wrapper { width: 100%; }

.stage-tasks-list {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-left: 18px;
}

.stage-tasks-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: 54px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
  padding: 8px 10px;
  z-index: 50;
  max-height: 260px;
  overflow-y: auto;
}

.dropdown-empty {
  font-size: 0.8rem;
  color: #64748b;
  padding: 8px 0;
}

.dropdown-tasks { display: flex; flex-direction: column; gap: 0; }

.dropdown-task-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 0 6px;
  height: 46px;
  border-radius: 0;
  background: transparent;
  cursor: grab;
  position: relative;
}
.dropdown-task-row:hover { background: #eef2ff; }
.dropdown-task-row.drag-over { background: #dbeafe; box-shadow: inset 0 0 0 2px #3b82f6; }
.dropdown-task-row.dragging { opacity: 0.55; }
.dropdown-task-row.has-predecessors {
  box-shadow: inset 2px 0 0 rgba(148, 163, 184, 0.65);
}
.dropdown-task-row.overdue-task-row {
  background: linear-gradient(90deg, rgba(254, 226, 226, 0.44) 0%, rgba(255, 255, 255, 0.9) 72%);
}
.task-pred-dot {
  margin-right: 4px;
  color: #94a3b8;
  font-weight: 600;
  font-size: 0.7rem;
  opacity: 0.9;
}

.dropdown-task-status {
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 0.75rem;
  box-shadow: none;
}
.dropdown-task-status:hover { background: transparent; }
.dropdown-task-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
}
.dropdown-task-title-row {
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dropdown-task-title {
  min-width: 0;
  flex: 1;
  font-size: 0.82rem;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dropdown-task-title[role='button'] {
  cursor: pointer;
}
.dropdown-task-title[role='button']:hover {
  color: #1d4ed8;
}
.dropdown-task-right-icons {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}
.overdue-fire-badge {
  flex: 0 0 auto;
  margin: 0;
  font-size: 0.82rem;
  line-height: 1;
  filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.85));
  animation: overdueFireFlicker 0.95s ease-in-out infinite;
}
.overdue-fire-badge--stage {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.76rem;
  z-index: 3;
}
.overdue-fire-badge--task {
  position: static;
  transform: none;
  margin-right: 2px;
  font-size: 0.72rem;
  z-index: auto;
}
.dropdown-task-link-btn {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-right: 0;
  cursor: pointer;
}
.dropdown-task-link-btn:hover {
  opacity: 0.82;
}
.dropdown-task-link-img {
  width: 12px;
  height: 12px;
  display: block;
}
.dropdown-task-link-spacer {
  width: 16px;
  height: 16px;
  display: inline-block;
  flex: 0 0 16px;
}
.gantt-timeline-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
  height: 100%;
}
.gantt-view .timeline-header {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 20;
  height: 40px;
  overflow: hidden;
}
.gantt-view .timeline-header.timeline-header--day-scale {
  height: 76px;
  overflow: hidden;
}
.timeline-header-rows {
  position: relative;
  width: 100%;
  height: 100%;
}
.timeline-header-row {
  position: absolute;
  left: 0;
  right: 0;
}
.timeline-header-row--month {
  top: 0;
  height: 24px;
}
.timeline-header-row--week {
  top: 24px;
  height: 24px;
}
.timeline-header-row--day {
  top: 48px;
  height: 28px;
}
.timeline-unit {
  height: 40px;
  box-sizing: border-box;
}
.tick-label {
  height: 40px;
  width: 100%;
  line-height: 40px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #1e293b;
  text-align: center;
  background: #f1f5f9;
  padding: 0 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-right: 1px solid #e2e8f0;
  box-sizing: border-box;
}
.timeline-unit--month,
.timeline-unit--week,
.timeline-unit--day {
  box-sizing: border-box;
}
.timeline-unit--month {
  height: 24px;
}
.timeline-unit--week {
  height: 24px;
}
.timeline-unit--day {
  height: 28px;
}
.tick-label--month,
.tick-label--week,
.tick-label--day {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-right: 1px solid rgba(148, 163, 184, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: uppercase;
}
.tick-label--month {
  height: 24px;
  background: #f1f5f9;
  color: #334155;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.55);
}
.tick-label--week {
  height: 24px;
  background: #f1f5f9;
  color: #334155;
  font-size: 0.7rem;
  font-weight: 800;
  border-bottom: 1px solid rgba(148, 163, 184, 0.55);
}
.tick-label--day {
  height: 28px;
  background: #ffffff;
  color: #64748b;
  font-size: 0.64rem;
  font-weight: 700;
  text-transform: none;
}
.day-cell {
  height: 100%;
  border-right: 1px solid #e2e8f0;
  background: transparent;
  flex-shrink: 0;
}
.timeline-tasks { flex: 1; position: relative; overflow-x: hidden; overflow-y: auto; }
.tasks-wrapper { position: relative; min-height: 100%; }
.gantt-dependencies {
  position: absolute;
  left: 0;
  top: 0;
  /* ширина/высота задаются атрибутами SVG = контент этапов; полотно ниже — только сетка дней */
  z-index: 25;
  pointer-events: none;
  overflow: visible;
}
.gantt-drag-date-tooltip {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 60;
  pointer-events: none;
  background: rgba(255, 255, 255, 0.98);
  color: #1e293b;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.14);
}
.gantt-dependency-path {
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
  opacity: 0.8;
  transition: opacity 0.12s ease, stroke-width 0.12s ease, filter 0.12s ease;
}
.gantt-dependency-path--highlighted {
  opacity: 0.98;
  stroke-width: 2.85;
  filter: drop-shadow(0 0 2px rgba(249, 115, 22, 0.45));
}
.gantt-dependency-end-dot {
  stroke: rgba(255, 255, 255, 0.9);
  stroke-width: 1.2;
  vector-effect: non-scaling-stroke;
  opacity: 0.96;
}
.gantt-dependency-hit {
  stroke-width: 14;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  pointer-events: stroke;
  cursor: pointer;
}
.gantt-dependency-preview {
  stroke: rgba(59, 130, 246, 0.55);
  stroke-width: 1.8;
  stroke-dasharray: 5 6;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
.gantt-new-link-preview {
  stroke: rgba(144, 238, 144, 0.72);
  stroke-width: 2;
  stroke-dasharray: 4 5;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
.gantt-stage-link-preview {
  stroke: rgba(72, 61, 139, 0.55);
  stroke-width: 1.8;
  stroke-dasharray: 5 6;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
.gantt-stage-dependency-path {
  stroke: rgba(54, 94, 116, 0.88);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  pointer-events: all;
  cursor: pointer;
  opacity: 0.84;
}
.gantt-stage-dep-end-dot {
  fill: rgba(54, 94, 116, 0.9);
  stroke: rgba(255, 255, 255, 0.92);
  stroke-width: 1.3;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
.gantt-stage-dep-marker-group {
  pointer-events: all;
}
.gantt-stage-dep-marker {
  fill: rgba(255, 255, 255, 0.95);
  stroke: rgba(72, 61, 139, 0.85);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
  cursor: pointer;
}
.gantt-stage-dep-marker--filled {
  fill: rgba(72, 61, 139, 0.92);
  stroke: rgba(255, 255, 255, 0.9);
}
.gantt-stage-dep-marker:hover {
  filter: drop-shadow(0 1px 3px rgba(72, 61, 139, 0.45));
}
.stage-dep-label-popover {
  position: fixed;
  z-index: 220;
  width: min(300px, calc(100vw - 24px));
  padding: 12px 14px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18);
  font-size: 0.8125rem;
  color: #1e293b;
}
.stage-dep-label-popover-title {
  font-weight: 600;
  margin-bottom: 10px;
  color: #334155;
}
.stage-dep-label-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.stage-dep-label-field span {
  font-size: 0.75rem;
  color: #64748b;
}
.stage-dep-label-field select,
.stage-dep-label-field input[type='date'],
.stage-dep-label-field input[type='number'],
.stage-dep-label-field textarea {
  font: inherit;
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}
.stage-dep-label-field textarea {
  resize: vertical;
  min-height: 72px;
}
.stage-dep-label-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.stage-dep-label-actions .btn-ghost {
  background: transparent;
  color: #64748b;
}
.stage-dep-label-tooltip {
  position: fixed;
  z-index: 225;
  max-width: min(280px, calc(100vw - 24px));
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  color: #1e293b;
  border: 1px solid #cbd5e1;
  font-size: 0.75rem;
  line-height: 1.45;
  white-space: pre-line;
  pointer-events: none;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
}
.gantt-stage-bar-tooltip {
  position: fixed;
  z-index: 225;
  max-width: min(340px, calc(100vw - 24px));
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  color: #1e293b;
  border: 1px solid #cbd5e1;
  font-size: 0.75rem;
  line-height: 1.45;
  white-space: pre-line;
  pointer-events: none;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
}
.gantt-dep-handle {
  pointer-events: all;
  cursor: grab;
  touch-action: none;
  vector-effect: non-scaling-stroke;
}
.gantt-dep-handle-tail {
  opacity: 0;
  pointer-events: none;
}
.gantt-dep-handle-head {
  opacity: 0;
}
.gantt-dep-handle:hover {
  filter: brightness(0.95);
}
:global(body.is-dep-link-drag) {
  cursor: grabbing !important;
  user-select: none;
}
.days-grid {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  display: flex;
  pointer-events: none;
  z-index: 1;
}
.gantt-calendar-highlights {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
  z-index: 2;
}
.gantt-calendar-highlight-day {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(239, 68, 68, 0.045);
}
.gantt-calendar-highlight-day.is-holiday {
  background: rgba(239, 68, 68, 0.07);
}
.gantt-month-dividers {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
  z-index: 4;
}
.gantt-month-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  transform: translateX(-1px);
  background: rgba(71, 85, 105, 0.62);
  box-shadow: 0 0 0 1px rgba(226, 232, 240, 0.7);
}
.grid-day {
  height: 100%;
  box-sizing: border-box;
  border-right: 1px solid #f1f5f9;
  background: transparent;
  flex-shrink: 0;
}
.today-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #d97745;
  z-index: 38;
  pointer-events: none;
  box-shadow: 0 0 8px rgba(217, 119, 69, 0.4);
}
.today-label {
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  border-radius: 999px;
  background: #d97745;
  color: #ffffff;
  border: 1px solid #ffffff;
  font-size: 0.65rem;
  line-height: 1.2;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(217, 119, 69, 0.32);
  z-index: 45;
}
.tasks-container { position: relative; z-index: 5; }
.timeline-task-row-wrapper { position: relative; min-height: 54px; }
.timeline-task-row {
  position: relative;
  height: 100%;
  width: 100%;
  /* Строка выше соседних при hover — кнопка связи справа не уходит под следующий этап */
  z-index: 1;
}
.timeline-task-row:hover,
.timeline-task-row.hovered {
  z-index: 8;
}
.task-bar-baseline {
  position: absolute;
  height: 4px;
  top: 10px;
  border-radius: 999px;
  background: repeating-linear-gradient(
    -45deg,
    rgba(100, 116, 139, 0.35),
    rgba(100, 116, 139, 0.35) 6px,
    rgba(148, 163, 184, 0.2) 6px,
    rgba(148, 163, 184, 0.2) 12px
  );
  pointer-events: none;
  z-index: 3;
}
.timeline-task-row.hovered::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: transparent;
  pointer-events: none;
  z-index: 1;
}
.task-bar {
  position: absolute;
  height: 25px;
  top: 15px;
  border-radius: 3px;
  overflow: visible;
  cursor: grab;
  min-width: 4px;
  z-index: 5;
  border: 1px solid transparent;
}
.gantt-stage-add-link {
  position: absolute;
  right: -23px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 0;
  cursor: crosshair;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
  color: #483D8B;
  background: transparent;
  box-shadow: none;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease, transform 0.12s ease, background 0.12s ease;
  /* Выше слоя SVG зависимостей (25), чтобы клик доходил до кнопки */
  z-index: 40;
}
/* Вся строка этапа — иначе при движении к «+» курсор выходит из .task-bar и кнопка исчезает */
.timeline-task-row:hover .gantt-stage-add-link,
.timeline-task-row:focus-within .gantt-stage-add-link,
.task-bar:hover .gantt-stage-add-link,
.gantt-stage-add-link:focus-visible {
  opacity: 1;
  pointer-events: auto;
}
.gantt-stage-add-link:hover {
  background: transparent;
  color: #5b4ea6;
  transform: translateY(-50%) scale(1.06);
}
.task-bar:hover { transform: none; box-shadow: 0 4px 8px rgba(0,0,0,0.15); z-index: 10; }
.task-bar.completed { background: #90EE90; }
/* Незаполненная часть как у «не начато» — заливка прогресса отдельным слоем #90EE90 */
.task-bar.in-progress { background: #C0C0C0; }
.task-bar.not-started { background: #C0C0C0; }
/* Трек этапа при наличии задач в работе — SkyBlue (как getBlockBackgroundColor) */
.task-bar.stage-has-active-work:not(.completed):not(.overdue) {
  background: #87CEEB;
}
.task-bar.critical-path-stage {
  box-shadow:
    inset 0 0 0 2px rgba(249, 115, 22, 0.98),
    0 0 8px rgba(249, 115, 22, 0.38),
    0 0 14px rgba(245, 158, 11, 0.26);
}
.task-bar.overdue { background: #ef4444 !important; }
.task-bar.overdue {
  box-shadow:
    0 0 0 1px rgba(239, 68, 68, 0.9),
    0 0 10px rgba(239, 68, 68, 0.42),
    0 0 16px rgba(245, 158, 11, 0.26);
  animation: overdueBarFlame 1.1s ease-in-out infinite;
}
.task-bar.overdue::after {
  content: '🔥';
  position: absolute;
  right: -10px;
  top: -11px;
  font-size: 0.82rem;
  pointer-events: none;
  filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.9));
  animation: overdueFireFloat 1.05s ease-in-out infinite;
}
.task-bar.task-risk { box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.95); }
.task-bar.task-delayed { box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.95); }
.task-progress {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: #90EE90;
  z-index: 2;
}
.task-sub-bars { pointer-events: auto; z-index: 6; }
.task-sub-bar-wrap {
  position: absolute;
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 0 2px 0 4px;
  box-sizing: border-box;
  border-radius: 4px;
  cursor: grab;
  z-index: 7;
}
.task-sub-bar-wrap:hover,
.task-sub-bar-wrap:focus-within {
  z-index: 40;
}
.task-sub-bar-wrap.drag-over { box-shadow: inset 0 0 0 2px #3b82f6; background: rgba(59, 130, 246, 0.08); }
.task-sub-bar-wrap.dragging { opacity: 0.55; }
.task-sub-bar-wrap.task-date-dragging { opacity: 0.92; z-index: 40; }
.task-sub-bar-wrap.has-predecessors {
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.25), inset 3px 0 0 rgba(148, 163, 184, 0.45);
}
.task-sub-bar-wrap.critical-path-task {
  box-shadow:
    inset 0 0 0 2px rgba(249, 115, 22, 0.98),
    inset 4px 0 0 rgba(249, 115, 22, 0.95),
    0 0 8px rgba(249, 115, 22, 0.34);
}
.task-sub-bar-wrap.overdue-task .task-sub-bar-inner {
  box-shadow:
    inset 0 0 0 1px rgba(239, 68, 68, 0.9),
    0 0 7px rgba(239, 68, 68, 0.35),
    0 0 12px rgba(245, 158, 11, 0.22);
  animation: overdueBarFlame 1.15s ease-in-out infinite;
}
.task-sub-bar-wrap.overflow-tail-task .task-sub-bar-inner {
  overflow: visible;
}
.task-sub-bar-wrap.overflow-tail-task .task-sub-bar-inner::before,
.task-sub-bar-wrap.overflow-tail-task .task-sub-bar-inner::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  background: #dc2626;
  opacity: 0.86;
  pointer-events: none;
}
.task-sub-bar-wrap.overflow-tail-task .task-sub-bar-inner::before {
  left: 0;
  width: var(--overflow-left-px, 0px);
  border-radius: 6px 0 0 6px;
}
.task-sub-bar-wrap.overflow-tail-task .task-sub-bar-inner::after {
  right: 0;
  width: var(--overflow-right-px, 0px);
  border-radius: 0 6px 6px 0;
}
.task-sub-bar-wrap.overdue-task::after {
  content: '🔥';
  position: absolute;
  right: -9px;
  top: -10px;
  font-size: 0.74rem;
  pointer-events: none;
  filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.85));
  animation: overdueFireFloat 1.08s ease-in-out infinite;
}
.task-sub-bar-inner {
  flex: 1;
  min-width: 0;
  align-self: center;
  height: 23px;
  position: relative;
  border-radius: 2px;
  opacity: 0.92;
  cursor: grab;
}
.task-sub-bar-drag-dates {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 7;
  max-width: calc(100% - 12px);
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: #1f2937;
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  overflow: visible;
  text-overflow: clip;
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.55);
  pointer-events: none;
}
.task-sub-bar-wrap.task-date-dragging .task-sub-bar-inner { cursor: grabbing; }
.task-sub-bar-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  height: auto;
  transform: none;
  border-radius: 2px;
  border: 1px solid rgba(148, 163, 184, 0.55);
  background: rgba(241, 245, 249, 0.96);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.14s ease, transform 0.14s ease, background-color 0.14s ease;
  z-index: 6;
}
.task-sub-bar-handle::before {
  content: '';
  position: absolute;
  inset: 4px 3px;
  border-radius: 2px;
  background:
    linear-gradient(90deg,
      transparent 0,
      transparent 28%,
      rgba(100, 116, 139, 0.9) 28%,
      rgba(100, 116, 139, 0.9) 40%,
      transparent 40%,
      transparent 60%,
      rgba(100, 116, 139, 0.9) 60%,
      rgba(100, 116, 139, 0.9) 72%,
      transparent 72%,
      transparent 100%);
}
.task-sub-bar-handle--left {
  left: -5px;
  cursor: ew-resize;
}
.task-sub-bar-handle--right {
  right: -5px;
  cursor: ew-resize;
}
.task-sub-bar-wrap:hover .task-sub-bar-handle,
.task-sub-bar-wrap.task-date-dragging .task-sub-bar-handle {
  opacity: 1;
  pointer-events: auto;
}
.task-sub-bar-wrap:hover .task-sub-bar-handle {
  transform: scaleY(1.01);
}
.task-sub-bar-handle:hover {
  background: #ffffff;
}
.task-sub-bar-end {
  position: absolute;
  right: -22px;
  top: 0;
  bottom: 0;
  flex: 0 0 22px;
  width: 22px;
  overflow: visible;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent !important;
  box-shadow: none;
  opacity: 1;
  pointer-events: auto;
  cursor: crosshair;
}
.gantt-sub-bar-add-link {
  position: absolute;
  right: 5px;
  top: calc(50% - 7px);
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 0;
  cursor: crosshair;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1;
  color: #3b82f6;
  background: transparent;
  box-shadow: none;
  z-index: 8;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease 0.22s, transform 0.12s ease, filter 0.12s ease;
  touch-action: none;
  z-index: 45;
}
.task-sub-bar-wrap:hover .gantt-sub-bar-add-link,
.task-sub-bar-end:hover .gantt-sub-bar-add-link,
.task-sub-bar-end:focus-within .gantt-sub-bar-add-link,
.task-sub-bar-wrap.task-date-dragging .gantt-sub-bar-add-link {
  opacity: 1;
  pointer-events: auto;
  transition-delay: 0s;
}
.gantt-sub-bar-add-link:hover {
  filter: brightness(0.95);
  transform: translateY(-50%) scale(1.06);
}
.subtask-segments {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 2px;
  height: 10px;
  display: flex;
  pointer-events: none;
  z-index: 5;
}
.subtask-segment {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 2px;
  opacity: 0.85;
}
.subtask-more {
  position: absolute;
  right: 4px;
  bottom: 9px;
  font-size: 0.55rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
.bar-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  z-index: 6;
  background: rgba(0, 0, 0, 0.12);
  pointer-events: auto;
}
.bar-handle.left { left: 0; cursor: ew-resize; }
.bar-handle.right { right: 0; cursor: ew-resize; }
.task-bar-delta {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.55rem;
  font-weight: 700;
  color: #ffffff;
  background: rgba(15, 23, 42, 0.28);
  border-radius: 999px;
  padding: 2px 6px;
  line-height: 1;
}

@keyframes overdueFireFlicker {
  0%, 100% {
    transform: translateY(0) scale(1);
    opacity: 0.95;
  }
  40% {
    transform: translateY(-1px) scale(1.07);
    opacity: 1;
  }
  70% {
    transform: translateY(0.5px) scale(0.96);
    opacity: 0.86;
  }
}

@keyframes overdueFireFloat {
  0%, 100% {
    transform: translateY(0) scale(1);
    opacity: 0.92;
  }
  50% {
    transform: translateY(-2px) scale(1.08);
    opacity: 1;
  }
}

@keyframes overdueBarFlame {
  0%, 100% {
    filter: saturate(1) brightness(1);
  }
  50% {
    filter: saturate(1.15) brightness(1.08);
  }
}
.virtual-scroller-gantt {
  height: 100%;
  overflow-y: auto;
  scrollbar-width: none;
}
.virtual-scroller-gantt::-webkit-scrollbar { width: 0px; height: 0px; }
.virtual-scroller-gantt .vue-recycle-scroller__item-view {
  margin-bottom: 0px;
  height: 54px !important;
}
.auto-level-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 12000;
}
.auto-level-modal {
  width: min(92vw, 560px);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.25);
  padding: 14px;
}
.auto-level-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.auto-level-modal__head h3 {
  margin: 0;
  font-size: 1rem;
  color: #0f172a;
}
.auto-level-modal__close {
  width: 28px;
  height: 28px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  cursor: pointer;
}
.auto-level-modal__body {
  display: grid;
  gap: 10px;
}
.auto-level-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.auto-level-stage-actions {
  display: flex;
  gap: 6px;
}
.auto-level-stage-actions .btn {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-size: 0.78rem;
  font-weight: 600;
  transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}
.auto-level-stage-actions .btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
  transform: translateY(-1px);
}
.auto-level-stage-actions .btn:active {
  transform: translateY(0);
}
.auto-level-stage-list {
  max-height: 132px;
  overflow: auto;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 4px;
  background: #fff;
}
.auto-level-stage-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 0.82rem;
  color: #334155;
}
.auto-level-stage-item:hover {
  background: #f8fafc;
}
.auto-level-mode-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.auto-level-mode-choice {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  cursor: pointer;
  user-select: none;
  color: #334155;
  font-weight: 600;
  font-size: 0.82rem;
}
.auto-level-mode-choice input[type='radio'] {
  margin: 0;
  accent-color: #3b82f6;
}
.auto-level-mode-choice.active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}
.auto-level-field span {
  font-size: 0.76rem;
  color: #475569;
  font-weight: 600;
}
.auto-level-field select,
.auto-level-field input[type="number"] {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 0.85rem;
  color: #0f172a;
}
.auto-level-employee-stepper {
  display: grid;
  grid-template-columns: 44px 72px 44px;
  gap: 6px;
  align-items: center;
}
.auto-level-employee-stepper .btn {
  position: relative;
  z-index: 2;
  min-height: 30px;
  padding: 0;
  min-width: 44px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
}
.auto-level-employee-stepper .btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.auto-level-employee-stepper input[type="number"] {
  position: relative;
  z-index: 1;
  text-align: center;
  font-weight: 700;
  font-size: 0.9rem;
}
.auto-level-employee-stepper input[type='number']::-webkit-outer-spin-button,
.auto-level-employee-stepper input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.auto-level-employee-stepper input[type='number'] {
  -moz-appearance: textfield;
}
.auto-level-slider-wrap {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
}
.auto-level-slider-wrap input[type="range"] {
  width: 100%;
}
.auto-level-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #334155;
  font-size: 0.82rem;
}
.auto-level-note {
  border: 1px solid #dbeafe;
  background: #eff6ff;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.78rem;
  color: #1e3a8a;
  line-height: 1.35;
}
.auto-level-warning {
  border: 1px solid #fecaca;
  background: #fff1f2;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.78rem;
  color: #991b1b;
  line-height: 1.35;
}
.auto-level-modal__actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.auto-level-modal__actions .btn {
  min-width: 106px;
  height: 34px;
  padding: 0 14px;
  border-radius: 9px;
  border: 1px solid transparent;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.16s ease;
}
.auto-level-modal__actions .btn.btn-ghost {
  background: #f8fafc;
  color: #475569;
  border-color: #cbd5e1;
}
.auto-level-modal__actions .btn.btn-ghost:hover {
  background: #e2e8f0;
  color: #334155;
}
.auto-level-modal__actions .btn:not(.btn-ghost) {
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  border-color: #1d4ed8;
  box-shadow: 0 5px 12px rgba(37, 99, 235, 0.26);
}
.auto-level-modal__actions .btn:not(.btn-ghost):hover {
  filter: brightness(1.05);
}
.auto-level-modal__actions .btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}
</style>