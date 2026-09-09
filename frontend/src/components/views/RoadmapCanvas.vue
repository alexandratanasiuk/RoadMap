<template>
  <div class="roadmap-view">
    <div class="roadmap-header">
      <h2>🛣️ Roadmap Canvas · {{ taskProgressLabel }}</h2>
      <div class="roadmap-controls">
        <button class="btn btn-small" @click="zoomIn">➕ Увеличить</button>
        <button class="btn btn-small" @click="zoomOut">➖ Уменьшить</button>
        <button class="btn btn-small" @click="resetZoom">🔄 Сбросить</button>
      </div>
    </div>

    <div ref="canvasWrapRef" class="roadmap-canvas-wrap" @wheel.prevent="onWheel" @mouseleave="hidePendingTooltip">
      <svg
        :viewBox="`0 0 ${baseWidth} ${baseHeight}`"
        class="roadmap-canvas"
        :style="{ transform: `scale(${zoom})` }"
        role="img"
        aria-label="Roadmap canvas view"
      >
        <defs>
          <clipPath id="roadReadyClip">
            <rect
              v-for="segment in readyClipSegments"
              :key="`ready-segment-${segment.index}`"
              :x="segment.x"
              y="0"
              :width="segment.width"
              :height="baseHeight"
            />
          </clipPath>
          <clipPath id="roadPendingHoverClip">
            <rect
              v-if="hoveredPendingSegment"
              :x="hoveredPendingSegment.x"
              y="0"
              :width="hoveredPendingSegment.width"
              :height="baseHeight"
            />
          </clipPath>
        </defs>

        <g class="road-base-layer" :style="{ opacity: roadBaseOpacity }">
          <path class="road-shadow" :d="roadPath" />
          <path class="road-main-base" :d="roadPath" />
          <path class="road-center-dash-base" :d="roadPath" />
        </g>

        <g clip-path="url(#roadReadyClip)" :style="{ opacity: readyRoadOpacity }">
          <path class="road-main-filled" :d="roadPath" />
          <path class="road-center-dash-filled" :d="roadPath" />
        </g>

        <g v-if="hoveredPendingSegment" class="pending-road-highlight" clip-path="url(#roadPendingHoverClip)">
          <path class="road-main-pending-hover" :d="roadPath" />
        </g>

        <g class="pending-hover-layer">
          <rect
            v-for="segment in pendingHoverSegments"
            :key="`pending-segment-${segment.index}`"
            class="pending-hover-hit"
            :x="segment.x"
            :y="hoverBandY"
            :width="segment.width"
            :height="hoverBandHeight"
            @mouseenter="showPendingTooltip(segment, $event)"
            @mousemove="movePendingTooltip($event)"
            @mouseleave="hidePendingTooltip"
          />
        </g>

        <g class="decor-layer decor-layer-dim">
          <g
            v-for="tree in trees"
            :key="`tree-dim-${tree.id}`"
            class="decor-tree"
            :transform="`translate(${tree.x}, ${tree.y})`"
          >
            <rect x="-2.5" y="6" width="5" height="12" rx="1.5" fill="#6b4f3a" />
            <circle cx="0" cy="2" :r="tree.r" fill="#16a34a" />
            <circle cx="-6" cy="5" :r="tree.r * 0.72" fill="#22c55e" />
            <circle cx="6" cy="5" :r="tree.r * 0.72" fill="#22c55e" />
          </g>

          <g
            v-for="house in houses"
            :key="`house-dim-${house.id}`"
            class="decor-house"
            :transform="`translate(${house.x}, ${house.y})`"
          >
            <rect x="-10" y="-8" width="20" height="14" rx="2" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.2" />
            <path d="M -12 -8 L 0 -16 L 12 -8 Z" fill="#f97316" stroke="#ea580c" stroke-width="1" />
            <rect x="-3" y="-1" width="6" height="7" rx="1" fill="#60a5fa" />
          </g>
        </g>

        <g class="decor-layer decor-layer-ready" clip-path="url(#roadReadyClip)" :style="{ opacity: readyDecorOpacity }">
          <g
            v-for="tree in trees"
            :key="`tree-ready-${tree.id}`"
            class="decor-tree"
            :transform="`translate(${tree.x}, ${tree.y})`"
          >
            <rect x="-2.5" y="6" width="5" height="12" rx="1.5" fill="#6b4f3a" />
            <circle cx="0" cy="2" :r="tree.r" fill="#16a34a" />
            <circle cx="-6" cy="5" :r="tree.r * 0.72" fill="#22c55e" />
            <circle cx="6" cy="5" :r="tree.r * 0.72" fill="#22c55e" />
          </g>

          <g
            v-for="house in houses"
            :key="`house-ready-${house.id}`"
            class="decor-house"
            :transform="`translate(${house.x}, ${house.y})`"
          >
            <rect x="-10" y="-8" width="20" height="14" rx="2" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.2" />
            <path d="M -12 -8 L 0 -16 L 12 -8 Z" fill="#f97316" stroke="#ea580c" stroke-width="1" />
            <rect x="-3" y="-1" width="6" height="7" rx="1" fill="#60a5fa" />
          </g>
        </g>

        <g
          v-if="todayCarPosition"
          class="progress-car"
          :class="{
            'progress-car-danger': carVisualState === 'danger',
            'progress-car-warning': carVisualState === 'warning',
            'progress-car-happy': carVisualState === 'good'
          }"
          :transform="`translate(${animatedCarPosition.x}, ${animatedCarPosition.y}) rotate(${animatedCarAngle})`"
          :style="{ opacity: carOpacity }"
        >
          <title>
            {{
              carVisualState === 'danger'
                ? 'Есть просроченные задачи'
                : carVisualState === 'warning'
                  ? 'Текущая задача завершена, но этап ещё не закрыт'
                  : 'Просроченных задач нет'
            }}
          </title>

          <g v-if="carVisualState === 'good'" class="car-good">
            <rect x="-16" y="-10" width="32" height="11" rx="4" fill="#22c55e" />
            <rect x="-9" y="-17" width="18" height="9" rx="3" fill="#16a34a" />
            <rect x="-6" y="-15" width="5" height="4" rx="1" fill="#dbeafe" />
            <rect x="1" y="-15" width="5" height="4" rx="1" fill="#dbeafe" />
            <circle cx="-9" cy="2" r="3.5" fill="#111827" />
            <circle cx="9" cy="2" r="3.5" fill="#111827" />
            <circle cx="-9" cy="2" r="1.6" fill="#9ca3af" />
            <circle cx="9" cy="2" r="1.6" fill="#9ca3af" />
            <circle cx="12" cy="-16" r="6.5" fill="#fef9c3" stroke="#facc15" stroke-width="1.1" />
            <circle cx="10" cy="-17" r="0.8" fill="#1f2937" />
            <circle cx="14" cy="-17" r="0.8" fill="#1f2937" />
            <path d="M 9 -14 Q 12 -12 15 -14" fill="none" stroke="#1f2937" stroke-width="0.9" stroke-linecap="round" />
          </g>

          <g v-else-if="carVisualState === 'warning'" class="car-warning">
            <rect x="-16" y="-10" width="32" height="11" rx="4" fill="#facc15" />
            <rect x="-9" y="-17" width="18" height="9" rx="3" fill="#eab308" />
            <rect x="-6" y="-15" width="5" height="4" rx="1" fill="#dbeafe" />
            <rect x="1" y="-15" width="5" height="4" rx="1" fill="#dbeafe" />
            <circle cx="-9" cy="2" r="3.5" fill="#111827" />
            <circle cx="9" cy="2" r="3.5" fill="#111827" />
            <circle cx="-9" cy="2" r="1.6" fill="#9ca3af" />
            <circle cx="9" cy="2" r="1.6" fill="#9ca3af" />
            <circle cx="18" cy="-10" r="3" fill="rgba(248, 250, 252, 0.9)" class="car-smoke-1" />
            <circle cx="22" cy="-13" r="2.4" fill="rgba(241, 245, 249, 0.82)" class="car-smoke-2" />
            <circle cx="25" cy="-16" r="1.9" fill="rgba(226, 232, 240, 0.72)" class="car-smoke-3" />
          </g>

          <g v-else class="car-bad" transform="rotate(-10)">
            <rect x="-16" y="-10" width="32" height="11" rx="4" fill="#ef4444" />
            <rect x="-9" y="-17" width="18" height="9" rx="3" fill="#dc2626" />
            <rect x="-6" y="-15" width="5" height="4" rx="1" fill="#dbeafe" />
            <rect x="1" y="-15" width="5" height="4" rx="1" fill="#dbeafe" />
            <circle cx="-9" cy="2" r="3.5" fill="#111827" />
            <circle cx="9" cy="2" r="3.5" fill="#111827" />
            <circle cx="-9" cy="2" r="1.6" fill="#9ca3af" />
            <circle cx="9" cy="2" r="1.6" fill="#9ca3af" />
            <path class="car-flame-1" d="M 16 -10 C 22 -18, 19 -26, 14 -20 C 11 -16, 13 -12, 16 -10 Z" fill="#f97316" />
            <path class="car-flame-2" d="M 15 -12 C 18 -17, 17 -21, 14 -18 C 12 -16, 13 -13, 15 -12 Z" fill="#fde047" />
            <path d="M -2 -6 L 6 -2" stroke="#1f2937" stroke-width="1.2" />
            <path d="M -5 -4 L 3 0" stroke="#1f2937" stroke-width="1.2" />
          </g>
        </g>

        <g v-for="(point, idx) in stagePoints" :key="point.id">
          <line
            class="stage-connector"
            :x1="point.x"
            :y1="point.yRoad"
            :x2="point.x"
            :y2="animatedMarkerY(point, idx)"
            :style="{ opacity: stageItemProgress(idx) }"
          />

          <circle
            class="stage-anchor"
            :cx="point.x"
            :cy="point.yRoad"
            :r="3 + 6 * stageItemProgress(idx)"
            :style="{ opacity: stageItemProgress(idx) }"
          />

          <g
            class="stage-marker"
            :transform="`translate(${point.x}, ${animatedMarkerY(point, idx)})`"
            :style="{ opacity: stageItemProgress(idx) }"
            @click="onEditBlock(point.block)"
          >
            <circle class="marker-shadow" :r="point.markerRadius + 3" />
            <circle :r="point.markerRadius" :fill="markerColor(point.block)" />
            <text class="marker-index" y="-2">{{ String(idx + 1).padStart(2, '0') }}</text>
            <text class="marker-date" y="15">{{ formatDate(point.markerDate) }}</text>
          </g>

          <path
            class="callout-line"
            :d="calloutConnectorPath(point, idx)"
            :style="{ opacity: stageItemProgress(idx) }"
          />

          <g
            class="stage-callout"
            :transform="`translate(${point.calloutX}, ${animatedCalloutY(point, idx)})`"
            :style="{ opacity: stageItemProgress(idx) }"
            @click="onEditBlock(point.block)"
          >
            <rect
              class="callout-box"
              :x="point.calloutBoxX"
              :y="point.calloutBoxY"
              :width="point.calloutBoxWidth"
              :height="point.calloutBoxHeight"
              rx="10"
            />
            <text
              class="callout-title"
              :x="point.calloutTextX"
              :y="point.calloutTextY"
              :text-anchor="point.calloutAnchor"
            >
              {{ shortTitle(point.block.title) }}
            </text>
            <text
              class="callout-desc"
              :x="point.calloutTextX"
              :y="point.calloutTaskTextY"
              :text-anchor="point.calloutAnchor"
            >
              <tspan
                v-for="(line, lineIdx) in point.calloutTaskLines"
                :key="`${point.id}-task-${lineIdx}`"
                :x="point.calloutTextX"
                :dy="lineIdx === 0 ? 0 : 13"
              >
                {{ line }}
              </tspan>
            </text>
          </g>
        </g>
      </svg>
      <div
        v-if="pendingTooltip.visible"
        class="pending-tooltip"
        :style="{ left: `${pendingTooltip.x}px`, top: `${pendingTooltip.y}px` }"
      >
        {{ pendingTooltip.label }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, onMounted, onBeforeUnmount, ref, unref } from 'vue'

// Канвас-презентация прогресса проекта: дорога, маркеры этапов и позиция "сегодня".
const emit = defineEmits(['editBlock'])

const blocks = inject('blocks', ref([]))
const readOnlyInjected = inject('readOnly', computed(() => false))
const readOnly = computed(() => Boolean(unref(readOnlyInjected)))

const onEditBlock = (block) => {
  emit('editBlock', block)
}
const DEFAULT_DESKTOP_ZOOM = 1.3
const computeInitialZoom = () => {
  if (typeof window === 'undefined') return DEFAULT_DESKTOP_ZOOM
  const vw = window.innerWidth || 0
  const vh = window.innerHeight || 0
  if (vw <= 1366 || vh <= 800) return 0.82
  if (vw <= 1600 || vh <= 920) return 0.92
  return DEFAULT_DESKTOP_ZOOM
}
const zoom = ref(computeInitialZoom())
const stageRevealProgress = ref(0)
let stageRafId = 0
const roadIntroProgress = ref(0)
const readyIntroProgress = ref(0)
const carIntroProgress = ref(0)
const introRafIds = new Set()
const canvasWrapRef = ref(null)
const hoveredPendingSegment = ref(null)
const pendingTooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  label: ''
})

const baseWidth = 1600
const baseHeight = 700
const roadCoverage = 0.7
const sidePad = Math.round((baseWidth * (1 - roadCoverage)) / 2)
const leftPad = sidePad
const rightPad = sidePad
const centerY = baseHeight / 2 + 10
const roadAmp = 40
const exitOffset = 115
const roadStrokeWidth = 66
const roadCapRadius = roadStrokeWidth / 2
const MAX_CALLOUT_TASK_LINES = 8
const MARKER_RADIUS = 34
const hoverBandY = centerY - roadAmp - roadStrokeWidth / 2 - 12
const hoverBandHeight = roadAmp * 2 + roadStrokeWidth + 24

const toTimeOrNull = (dateLike) => {
  const ms = new Date(dateLike || '').getTime()
  return Number.isFinite(ms) ? ms : null
}

// Позиция этапа на канвасе = дата самого этапа.
const stageMarkerDate = (block) => {
  if (toTimeOrNull(block?.releaseDate) !== null) return block.releaseDate
  if (toTimeOrNull(block?.startDate) !== null) return block.startDate
  return null
}
const stageRangeStartDate = (block) => {
  if (toTimeOrNull(block?.startDate) !== null) return block.startDate
  if (toTimeOrNull(block?.releaseDate) !== null) return block.releaseDate
  return null
}

const sortedBlocks = computed(() => {
  return [...(blocks.value || [])]
    .filter((b) => stageMarkerDate(b))
    .sort((a, b) => new Date(stageMarkerDate(a)) - new Date(stageMarkerDate(b)))
})

const taskProgressRatio = computed(() => {
  const items = sortedBlocks.value
  if (!items.length) return 0
  let total = 0
  let done = 0
  for (const block of items) {
    const tasks = Array.isArray(block?.tasks) ? block.tasks : []
    total += tasks.length
    done += tasks.filter((task) => task?.status === 'done').length
  }
  if (total === 0) return 0
  return done / total
})

const taskProgressLabel = computed(() => `${Math.round(taskProgressRatio.value * 100)}% задач готово`)

const taskLaneSegments = computed(() => {
  const items = sortedBlocks.value
  if (!items.length) return []
  const points = items.map((b) => xForDate(stageMarkerDate(b)))
  const leftEdge = leftPad
  const rightEdge = baseWidth - rightPad
  const segments = []
  for (let i = 0; i < items.length; i += 1) {
    const start = i === 0 ? leftEdge : (points[i - 1] + points[i]) / 2
    const end = i === items.length - 1 ? rightEdge : (points[i] + points[i + 1]) / 2
    const block = items[i]
    const tasks = Array.isArray(block?.tasks) ? [...block.tasks] : []
    if (!tasks.length) continue
    tasks.sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
    const width = end - start
    if (width <= 0) continue
    const oneTaskWidth = width / tasks.length
    tasks.forEach((task, taskIdx) => {
      const taskDueMs = toTimeOrNull(task?.releaseDate) ?? toTimeOrNull(task?.startDate)
      const blockDueMs = toTimeOrNull(stageMarkerDate(block))
      segments.push({
        index: `${i}-${taskIdx}`,
        blockId: block?.id,
        taskIndex: taskIdx,
        tasksCount: tasks.length,
        start: start + oneTaskWidth * taskIdx,
        end: start + oneTaskWidth * (taskIdx + 1),
        done: task?.status === 'done',
        dueMs: Number.isFinite(taskDueMs) ? taskDueMs : blockDueMs,
        label: `${block?.title || 'Этап'}: ${task?.title || 'Без названия задачи'}`
      })
    })
  }
  return segments
})

const markerXByLastTaskColumn = computed(() => {
  const byBlock = new Map()
  for (const seg of taskLaneSegments.value) {
    if (!seg?.blockId) continue
    const prev = byBlock.get(seg.blockId)
    if (!prev || seg.taskIndex > prev.taskIndex) byBlock.set(seg.blockId, seg)
  }
  const out = new Map()
  byBlock.forEach((seg, blockId) => {
    // Маркер этапа ставим на столбец завершения последней задачи.
    out.set(blockId, seg.end)
  })
  return out
})

const dateRange = computed(() => {
  if (!sortedBlocks.value.length) return null
  const dates = sortedBlocks.value
    .flatMap((b) => [
      new Date(stageRangeStartDate(b) || '').getTime(),
      new Date(stageMarkerDate(b) || '').getTime()
    ])
    .filter((ms) => Number.isFinite(ms))
  if (!dates.length) return null
  return { min: Math.min(...dates), max: Math.max(...dates) }
})

const xForDate = (date) => {
  const range = dateRange.value
  const width = baseWidth - leftPad - rightPad
  if (!range || range.max === range.min) return leftPad + width / 2
  const t = (new Date(date).getTime() - range.min) / (range.max - range.min)
  return leftPad + width * t
}

const roadYAt = (x) => {
  const cycle = (Math.PI * 2) / (baseWidth - leftPad - rightPad)
  return centerY + Math.sin((x - leftPad) * cycle * 2) * roadAmp
}

const shortTaskTitle = (title) => {
  const str = String(title || '').trim()
  if (!str) return ''
  return str.length > 24 ? `${str.slice(0, 24)}…` : str
}

const getImplementedTaskLines = (block) => {
  const doneTasks = (block?.tasks || [])
    .filter((task) => task?.status === 'done')
    .map((task) => shortTaskTitle(task.title))
    .filter(Boolean)
  if (!doneTasks.length) return ['• Нет выполненных задач']
  const lines = doneTasks.slice(0, MAX_CALLOUT_TASK_LINES).map((title) => `• ${title}`)
  if (doneTasks.length > MAX_CALLOUT_TASK_LINES) lines.push('...')
  return lines
}

const rectIntersectsCircle = (rect, circle) => {
  const nearestX = Math.max(rect.left, Math.min(circle.cx, rect.right))
  const nearestY = Math.max(rect.top, Math.min(circle.cy, rect.bottom))
  const dx = circle.cx - nearestX
  const dy = circle.cy - nearestY
  return dx * dx + dy * dy <= circle.r * circle.r
}

const stagePoints = computed(() => {
  const rawPoints = sortedBlocks.value.map((block, index) => {
    const markerDate = stageMarkerDate(block)
    const x = markerXByLastTaskColumn.value.get(block.id) ?? xForDate(markerDate)
    const yRoad = roadYAt(x)
    const dir = index % 2 === 0 ? 1 : -1
    const yMarker = yRoad + exitOffset * dir
    const markerRadius = markerRadiusFor(block, index)
    const calloutRight = index % 2 === 0
    const calloutX = x + (calloutRight ? 36 : -36)
    const calloutY = yMarker + (dir > 0 ? 8 : -8)
    const calloutTaskLines = getImplementedTaskLines(block)
    const calloutBoxHeight = 42 + calloutTaskLines.length * 14

    return {
      id: block.id,
      index,
      block,
      markerDate,
      x,
      yRoad,
      yMarker,
      markerRadius,
      calloutX,
      calloutY,
      calloutRight,
      calloutBoxWidth: 180,
      calloutBoxHeight,
      calloutTaskLines
    }
  })

  const applyCalloutGeometry = (point) => {
    const dir = point.index % 2 === 0 ? 1 : -1
    const markerGap = point.markerRadius + 8
    point.calloutX = point.x + (point.calloutRight ? markerGap : -markerGap)
    point.calloutY = point.yMarker + (dir > 0 ? 8 : -8)
    point.calloutLineX = point.calloutRight ? 22 : -22
    point.calloutLineY = dir > 0 ? 14 : -14
    point.calloutBoxX = point.calloutRight ? 12 : -(point.calloutBoxWidth + 12)
    point.calloutTextX = point.calloutBoxX + point.calloutBoxWidth / 2
    point.calloutTextY = dir > 0 ? 24 : -(point.calloutBoxHeight - 16)
    point.calloutTaskTextY = point.calloutTextY + 16
    point.calloutAnchor = 'middle'
    point.calloutBoxY = dir > 0 ? 8 : -(point.calloutBoxHeight + 8)
  }

  // Если справа слишком близко следующий этап, переносим сноску влево.
  rawPoints.forEach((point) => {
    const edge = 14
    const requiredRight = point.markerRadius + 8 + 12 + point.calloutBoxWidth
    const requiredLeft = point.markerRadius + 8 + 12 + point.calloutBoxWidth
    const spaceRight = baseWidth - edge - point.x
    const spaceLeft = point.x - edge

    // У края canvas выбираем сторону, где реально есть место для блока.
    if (spaceRight < requiredRight && spaceLeft >= requiredLeft) {
      point.calloutRight = false
    } else if (spaceLeft < requiredLeft && spaceRight >= requiredRight) {
      point.calloutRight = true
    }

    const nearRight = rawPoints.some((other) => {
      if (other.id === point.id) return false
      const dx = other.x - point.x
      return dx > 0 && dx < 210
    })
    if (nearRight && point.calloutRight) {
      point.calloutRight = false
    }
    applyCalloutGeometry(point)
  })

  // Разводим подписи на каждой стороне дороги, чтобы прямоугольники не пересекались.
  const sideConfigs = [
    { dir: 1, multiplier: 1 },   // нижняя сторона: сдвигаем вниз
    { dir: -1, multiplier: -1 }  // верхняя сторона: сдвигаем вверх
  ]

  sideConfigs.forEach(({ dir, multiplier }) => {
    const getBox = (p) => {
      const left = p.calloutX + p.calloutBoxX
      const top = p.calloutY + p.calloutBoxY
      return {
        left,
        right: left + p.calloutBoxWidth,
        top,
        bottom: top + p.calloutBoxHeight
      }
    }

    const points = rawPoints
      .filter((p) => (p.index % 2 === 0 ? 1 : -1) === dir)
      .sort((a, b) => a.x - b.x)

    const placed = []
    points.forEach((point) => {
      // Сдвигаем подпись, пока она пересекается с любой уже размещенной на этой стороне.
      for (let i = 0; i < 8; i += 1) {
        let collided = false
        const curr = getBox(point)
        for (const prev of placed) {
          const p = getBox(prev)
          const overlapX = curr.left < p.right && curr.right > p.left
          const overlapY = curr.top < p.bottom && curr.bottom > p.top
          if (overlapX && overlapY) {
            const push = Math.max(10, p.bottom - curr.top + 10)
            point.calloutY += push * multiplier
            collided = true
            break
          }
        }
        if (!collided) break
      }
      placed.push(point)
    })
  })

  // Карточки сверху/снизу не должны пересекать маркеры этапов.
  const markerCircles = rawPoints.map((p) => ({
    cx: p.x,
    cy: p.yMarker,
    r: p.markerRadius + 8
  }))
  rawPoints.forEach((point) => {
    const direction = (point.index % 2 === 0 ? 1 : -1) === -1 ? -1 : 1
    for (let i = 0; i < 10; i += 1) {
      const rect = {
        left: point.calloutX + point.calloutBoxX,
        right: point.calloutX + point.calloutBoxX + point.calloutBoxWidth,
        top: point.calloutY + point.calloutBoxY,
        bottom: point.calloutY + point.calloutBoxY + point.calloutBoxHeight
      }
      const hasIntersection = markerCircles.some((circle) => rectIntersectsCircle(rect, circle))
      if (!hasIntersection) break
      point.calloutY += 14 * direction
    }
  })

  // Финальный поджим callout-блоков в границы canvas, чтобы ничего не обрезалось.
  rawPoints.forEach((point) => {
    const edge = 14
    const minTop = edge
    const maxBottom = baseHeight - edge

    let boxLeft = point.calloutX + point.calloutBoxX
    let boxRight = boxLeft + point.calloutBoxWidth
    if (boxLeft < edge) {
      point.calloutX += edge - boxLeft
      boxLeft = edge
      boxRight = boxLeft + point.calloutBoxWidth
    }
    if (boxRight > baseWidth - edge) {
      point.calloutX -= boxRight - (baseWidth - edge)
    }

    let boxTop = point.calloutY + point.calloutBoxY
    let boxBottom = boxTop + point.calloutBoxHeight
    if (boxTop < minTop) {
      point.calloutY += minTop - boxTop
      boxTop = minTop
      boxBottom = boxTop + point.calloutBoxHeight
    }
    if (boxBottom > maxBottom) {
      point.calloutY -= boxBottom - maxBottom
    }
  })

  return rawPoints
})

const roadPath = computed(() => {
  const usable = baseWidth - leftPad - rightPad
  const steps = 90
  let d = ''
  for (let i = 0; i <= steps; i += 1) {
    const x = leftPad + (usable * i) / steps
    const y = roadYAt(x)
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`
  }
  return d
})
const readyIntervals = computed(() => {
  const intervals = taskLaneSegments.value
    .filter((segment) => segment.done)
    .map((segment) => ({ start: segment.start, end: segment.end }))
  if (!intervals.length) return []
  const merged = []
  for (const interval of intervals) {
    const last = merged[merged.length - 1]
    if (!last || interval.start > last.end + 0.01) {
      merged.push({ ...interval })
    } else if (interval.end > last.end) {
      last.end = interval.end
    }
  }
  return merged
})

const pendingHoverSegments = computed(() => {
  return taskLaneSegments.value
    .filter((segment) => !segment.done)
    .map((segment, index) => ({
      index,
      x: segment.start,
      width: Math.max(3, segment.end - segment.start),
      label: segment.label
    }))
})

const placePendingTooltip = (event) => {
  const host = canvasWrapRef.value
  if (!host) return
  const bounds = host.getBoundingClientRect()
  const x = event.clientX - bounds.left + host.scrollLeft + 14
  const y = event.clientY - bounds.top + host.scrollTop - 38
  pendingTooltip.value.x = x
  pendingTooltip.value.y = y
}

const showPendingTooltip = (segment, event) => {
  hoveredPendingSegment.value = segment
  pendingTooltip.value.visible = true
  pendingTooltip.value.label = segment.label
  placePendingTooltip(event)
}

const movePendingTooltip = (event) => {
  if (!pendingTooltip.value.visible) return
  placePendingTooltip(event)
}

const hidePendingTooltip = () => {
  hoveredPendingSegment.value = null
  pendingTooltip.value.visible = false
}

const readyClipSegments = computed(() => {
  const minX = leftPad - roadCapRadius
  const maxX = baseWidth - rightPad + roadCapRadius
  const roadStart = leftPad
  const roadEnd = baseWidth - rightPad
  const edgeEpsilon = 0.5
  return readyIntervals.value.map((segment, index) => {
    const extendLeft = segment.start <= roadStart + edgeEpsilon ? roadCapRadius : 0
    const extendRight = segment.end >= roadEnd - edgeEpsilon ? roadCapRadius : 0
    const x = Math.max(minX, segment.start - extendLeft)
    const end = Math.min(maxX, segment.end + extendRight)
    return { index, x, width: Math.max(0, end - x) }
  }).filter((segment) => segment.width > 0)
})

const roadBaseOpacity = computed(() => Math.max(0, Math.min(1, roadIntroProgress.value)))
const readyRoadOpacity = computed(() => Math.max(0, Math.min(1, readyIntroProgress.value)))
const readyDecorOpacity = computed(() => readyRoadOpacity.value)
const carOpacity = computed(() => Math.max(0, Math.min(1, carIntroProgress.value)))

const markerTimelineAnchors = computed(() => {
  return sortedBlocks.value
    .map((block) => {
      const markerDate = stageMarkerDate(block)
      const dateMs = new Date(markerDate || '').getTime()
      if (!Number.isFinite(dateMs)) return null
      const x = markerXByLastTaskColumn.value.get(block.id) ?? xForDate(markerDate)
      if (!Number.isFinite(x)) return null
      return { dateMs, x }
    })
    .filter(Boolean)
    .sort((a, b) => a.dateMs - b.dateMs)
})

const xForTimelineDate = (dateMs) => {
  const anchors = markerTimelineAnchors.value
  const minX = leftPad + roadCapRadius
  const maxX = baseWidth - rightPad + roadCapRadius
  if (!anchors.length) {
    const range = dateRange.value
    if (!range) return minX
    const t = range.max === range.min ? (dateMs >= range.max ? 1 : 0) : (dateMs - range.min) / (range.max - range.min)
    const clamped = Math.max(0, Math.min(1, t))
    return minX + (maxX - minX) * clamped
  }
  if (anchors.length === 1) return Math.max(minX, Math.min(maxX, anchors[0].x))
  if (dateMs <= anchors[0].dateMs) {
    const range = dateRange.value
    if (range && range.min < anchors[0].dateMs) {
      const t = (dateMs - range.min) / (anchors[0].dateMs - range.min)
      const clamped = Math.max(0, Math.min(1, t))
      return minX + (anchors[0].x - minX) * clamped
    }
    return Math.max(minX, Math.min(maxX, anchors[0].x))
  }
  if (dateMs >= anchors[anchors.length - 1].dateMs) {
    const range = dateRange.value
    if (range && range.max > anchors[anchors.length - 1].dateMs) {
      const t = (dateMs - anchors[anchors.length - 1].dateMs) / (range.max - anchors[anchors.length - 1].dateMs)
      const clamped = Math.max(0, Math.min(1, t))
      return anchors[anchors.length - 1].x + (maxX - anchors[anchors.length - 1].x) * clamped
    }
    return Math.max(minX, Math.min(maxX, anchors[anchors.length - 1].x))
  }

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i]
    const b = anchors[i + 1]
    if (dateMs < a.dateMs || dateMs > b.dateMs) continue
    if (b.dateMs === a.dateMs) return Math.max(minX, Math.min(maxX, b.x))
    const t = (dateMs - a.dateMs) / (b.dateMs - a.dateMs)
    return Math.max(minX, Math.min(maxX, a.x + (b.x - a.x) * t))
  }
  return Math.max(minX, Math.min(maxX, anchors[anchors.length - 1].x))
}

const todayCarPosition = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  const centerX = xForTimelineDate(todayMs) - roadCapRadius
  const x = Math.min(baseWidth - rightPad + roadCapRadius, centerX + roadCapRadius)
  const y = roadYAt(centerX)
  const dx = 8
  const prevX = Math.max(leftPad, centerX - dx)
  const nextX = Math.min(baseWidth - rightPad, centerX + dx)
  const angle = (Math.atan2(roadYAt(nextX) - roadYAt(prevX), nextX - prevX) * 180) / Math.PI
  return { x, y, angle }
})

const currentRoadSegment = computed(() => {
  if (!todayCarPosition.value) return null
  const centerX = todayCarPosition.value.x - roadCapRadius
  const segment = taskLaneSegments.value.find((item) => centerX >= item.start && centerX <= item.end)
  if (segment) return segment
  if (!taskLaneSegments.value.length) return null
  if (centerX < taskLaneSegments.value[0].start) return taskLaneSegments.value[0]
  return taskLaneSegments.value[taskLaneSegments.value.length - 1]
})

const orderedTaskSegments = computed(() => {
  return [...taskLaneSegments.value].sort((a, b) => a.start - b.start)
})

const currentSegmentIndex = computed(() => {
  const segment = currentRoadSegment.value
  if (!segment) return -1
  return orderedTaskSegments.value.findIndex((item) => item.index === segment.index)
})

const hasUnfinishedTasksBehindCar = computed(() => {
  const segment = currentRoadSegment.value
  if (!segment) return false
  return orderedTaskSegments.value.some((item) => item.start < segment.start && !item.done)
})

const hasAnyOverdueTask = computed(() => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const todayMs = now.getTime()
  return sortedBlocks.value.some((block) => {
    const blockDueMs = toTimeOrNull(block?.releaseDate) ?? toTimeOrNull(block?.startDate)
    const tasks = Array.isArray(block?.tasks)
      ? [...block.tasks].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
      : []
    return tasks.some((task) => {
      if (task?.status === 'done') return false
      const taskDueMs =
        toTimeOrNull(task?.releaseDate) ??
        toTimeOrNull(task?.startDate) ??
        blockDueMs
      if (!Number.isFinite(taskDueMs)) return false
      return taskDueMs < todayMs
    })
  })
})

const carVisualState = computed(() => {
  if (hasAnyOverdueTask.value) return 'danger'
  if (hasUnfinishedTasksBehindCar.value) return 'danger'
  const segment = currentRoadSegment.value
  if (!segment) return 'good'
  const idx = currentSegmentIndex.value
  if (idx < 0) return 'good'
  const segments = orderedTaskSegments.value
  const doneAheadCount = segments.slice(idx + 1).filter((item) => item.done).length
  const unfinishedBehindCount = segments.slice(0, idx).filter((item) => !item.done).length

  if (segment.done) {
    // Зеленая, если путь до машинки непрерывно закрыт
    // и впереди есть минимум две закрытые задачи.
    return doneAheadCount >= 2 ? 'good' : 'warning'
  }

  // На одной незакрытой полосе — желтая; если сзади уже накопилось много незакрытых — красная.
  return unfinishedBehindCount >= 2 ? 'danger' : 'warning'
})

const animatedCarPosition = computed(() => {
  if (!todayCarPosition.value) return { x: 0, y: 0 }
  const startX = leftPad + roadCapRadius
  const endX = todayCarPosition.value.x
  const carX = startX + (endX - startX) * carIntroProgress.value
  const centerX = Math.max(leftPad, Math.min(baseWidth - rightPad, carX - roadCapRadius))
  return {
    x: carX,
    y: roadYAt(centerX)
  }
})

const animatedCarAngle = computed(() => {
  if (!todayCarPosition.value) return 0
  const startX = leftPad + roadCapRadius
  const endX = todayCarPosition.value.x
  const carX = startX + (endX - startX) * carIntroProgress.value
  const centerX = Math.max(leftPad, Math.min(baseWidth - rightPad, carX - roadCapRadius))
  const dx = 8
  const prevX = Math.max(leftPad, centerX - dx)
  const nextX = Math.min(baseWidth - rightPad, centerX + dx)
  return (Math.atan2(roadYAt(nextX) - roadYAt(prevX), nextX - prevX) * 180) / Math.PI
})

const trees = computed(() => {
  const items = []
  const usable = baseWidth - leftPad - rightPad
  const count = 26
  for (let i = 0; i < count; i += 1) {
    const x = leftPad + (usable * (i + 0.5)) / count
    const yRoad = roadYAt(x)
    const topSide = i % 2 === 0
    items.push({
      id: i,
      x,
      y: yRoad + (topSide ? -84 : 84),
      r: 6 + (i % 3)
    })
  }
  return items
})

const houses = computed(() => {
  const items = []
  const usable = baseWidth - leftPad - rightPad
  const count = 8
  for (let i = 0; i < count; i += 1) {
    const x = leftPad + (usable * (i + 0.7)) / count
    const yRoad = roadYAt(x)
    const topSide = i % 2 === 1
    items.push({
      id: i,
      x,
      y: yRoad + (topSide ? -136 : 136)
    })
  }
  return items
})

const shortTitle = (title) => {
  const str = String(title || 'Этап')
  return str.length > 16 ? `${str.slice(0, 16)}…` : str
}

const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

/** Серый — все задачи в todo; голубой — есть «в работе» или частично done; зелёный — все done. */
const markerColor = (block) => {
  const tasks = Array.isArray(block?.tasks) ? block.tasks : []
  if (!tasks.length) return '#C0C0C0'
  const statuses = tasks.map((t) => String(t?.status || 'todo'))
  const allDone = statuses.every((s) => s === 'done')
  if (allDone) return '#90EE90'
  const hasActive = statuses.some((s) => s === 'done' || s === 'progress')
  if (hasActive) return '#87CEEB'
  return '#C0C0C0'
}

const markerRadiusFor = (block, idx) => {
  return MARKER_RADIUS
}

const zoomIn = () => {
  zoom.value = Math.min(2.2, Number((zoom.value + 0.15).toFixed(2)))
}
const zoomOut = () => {
  zoom.value = Math.max(0.6, Number((zoom.value - 0.15).toFixed(2)))
}
const resetZoom = () => {
  zoom.value = 1
}
const onWheel = (e) => {
  if (e.deltaY < 0) zoomIn()
  else zoomOut()
}

const easeInOutCubic = (t) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
const clamp01 = (v) => Math.max(0, Math.min(1, v))

const stageItemProgress = (idx) => {
  const p = stageRevealProgress.value
  const local = clamp01((p - idx * 0.08) / 0.45)
  return easeInOutCubic(local)
}

const animatedMarkerY = (point, idx) => {
  const k = stageItemProgress(idx)
  return point.yRoad + (point.yMarker - point.yRoad) * k
}

const animatedCalloutY = (point, idx) => {
  const k = stageItemProgress(idx)
  return point.yRoad + (point.calloutY - point.yRoad) * k
}

const calloutConnectorPath = (point, idx) => {
  const sign = point.calloutRight ? 1 : -1
  const startX = point.x + sign * Math.max(1, point.markerRadius - 1)
  const startY = animatedMarkerY(point, idx)

  const calloutY = animatedCalloutY(point, idx)
  const boxLeft = point.calloutX + point.calloutBoxX
  const boxRight = boxLeft + point.calloutBoxWidth
  const endX = point.calloutRight ? boxLeft : boxRight
  const endY = calloutY + point.calloutBoxY + point.calloutBoxHeight / 2

  const c1X = startX + sign * 26
  const c1Y = startY
  const c2X = endX - sign * 20
  const c2Y = endY

  return `M ${startX} ${startY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${endX} ${endY}`
}

const startStagesReveal = () => {
  const duration = 2200
  const start = performance.now()
  stageRevealProgress.value = 0
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration)
    stageRevealProgress.value = t
    if (t < 1) stageRafId = requestAnimationFrame(tick)
  }
  stageRafId = requestAnimationFrame(tick)
}

const animateProgress = (targetRef, durationMs) => new Promise((resolve) => {
  const from = targetRef.value
  const to = 1
  if (durationMs <= 0 || Math.abs(to - from) < 0.001) {
    targetRef.value = to
    resolve()
    return
  }
  const startedAt = performance.now()
  let rafId = 0
  const tick = (now) => {
    const t = Math.min(1, (now - startedAt) / durationMs)
    targetRef.value = from + (to - from) * easeInOutCubic(t)
    if (t < 1) {
      rafId = requestAnimationFrame(tick)
      introRafIds.add(rafId)
    } else {
      resolve()
    }
  }
  rafId = requestAnimationFrame(tick)
  introRafIds.add(rafId)
})

const startRoadSequence = async () => {
  roadIntroProgress.value = 0
  readyIntroProgress.value = 0
  carIntroProgress.value = 0
  await animateProgress(roadIntroProgress, 900)
  await animateProgress(readyIntroProgress, 1000)
  await animateProgress(carIntroProgress, 2600)
}

onMounted(() => {
  startStagesReveal()
  startRoadSequence()
})

onBeforeUnmount(() => {
  if (stageRafId) cancelAnimationFrame(stageRafId)
  for (const rafId of introRafIds) cancelAnimationFrame(rafId)
  introRafIds.clear()
})
</script>

<style scoped>
.roadmap-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 12px;
  gap: 10px;
  background: #f8fafc;
}
.roadmap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.roadmap-header h2 {
  font-size: 1.1rem;
  color: #1e293b;
}
.roadmap-controls {
  display: flex;
  gap: 8px;
}
.btn {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 6px 10px;
  font-size: 0.78rem;
  cursor: pointer;
}
.btn:hover {
  background: #f1f5f9;
}
.roadmap-canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #eef2f7;
}
.roadmap-canvas {
  width: 1600px;
  height: 700px;
  display: block;
  margin: 0 auto;
  overflow: visible;
  transform-origin: center center;
  transition: transform 0.12s ease;
}
@media (max-width: 1600px), (max-height: 920px) {
  .roadmap-view {
    padding: 8px;
    gap: 8px;
  }
  .roadmap-header h2 {
    font-size: 1rem;
  }
  .roadmap-canvas-wrap {
    overflow: hidden;
  }
  .roadmap-canvas {
    width: 1500px;
    height: 656px;
  }
}
.road-shadow {
  fill: none;
  stroke: rgba(71, 85, 105, 0.2);
  stroke-width: 74;
}
.road-main-base {
  fill: none;
  stroke: #90a0b5;
  stroke-width: 66;
  stroke-linecap: round;
}
.road-center-dash-base {
  fill: none;
  stroke: #f7fbff;
  stroke-width: 4;
  stroke-dasharray: 14 10;
}
.road-main-filled {
  fill: none;
  stroke: #4b5563;
  stroke-width: 66;
  stroke-linecap: round;
}
.road-main-pending-hover {
  fill: none;
  stroke: #7c8ea3;
  stroke-width: 66;
  stroke-linecap: round;
}
.road-center-dash-filled {
  fill: none;
  stroke: #e5e7eb;
  stroke-width: 4;
  stroke-dasharray: 14 10;
  animation: roadDashFlow 3.4s linear infinite;
}
.progress-car {
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.25));
}
.progress-car-happy {
  opacity: 1;
}
.progress-car-danger {
  opacity: 1;
}
.progress-car-happy .car-good {
  animation: carFloat 2.4s ease-in-out infinite;
  transform-origin: center;
}
.progress-car-danger .car-bad {
  animation: carShake 0.35s ease-in-out infinite;
  transform-origin: center;
}
.progress-car-danger .car-flame-1 {
  animation: flameFlicker 0.35s ease-in-out infinite;
}
.progress-car-danger .car-flame-2 {
  animation: flameFlicker 0.28s ease-in-out infinite reverse;
}
.progress-car-warning .car-warning {
  animation: carFloat 2.4s ease-in-out infinite;
  transform-origin: center;
}
.progress-car-warning .car-smoke-1 {
  animation: smokeRiseA 1.5s ease-in-out infinite;
}
.progress-car-warning .car-smoke-2 {
  animation: smokeRiseB 1.8s ease-in-out infinite;
}
.progress-car-warning .car-smoke-3 {
  animation: smokeRiseC 2.1s ease-in-out infinite;
}
.decor-layer-dim {
  opacity: 0.7;
}
.decor-layer-ready {
  opacity: 1;
}
.pending-hover-hit {
  fill: rgba(148, 163, 184, 0.001);
  pointer-events: all;
}
.pending-tooltip {
  position: absolute;
  z-index: 20;
  max-width: 260px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #dbe3ef;
  background: rgba(255, 255, 255, 0.96);
  color: #1e293b;
  font-size: 0.78rem;
  line-height: 1.25;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.12);
  pointer-events: none;
}
@keyframes roadDashFlow {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -24; }
}
@keyframes carFloat {
  0% { transform: translateY(0); }
  50% { transform: translateY(-1.5px); }
  100% { transform: translateY(0); }
}
@keyframes carShake {
  0% { transform: translate(0, 0); }
  25% { transform: translate(-0.8px, -0.5px); }
  50% { transform: translate(0.8px, 0.4px); }
  75% { transform: translate(-0.6px, 0.5px); }
  100% { transform: translate(0, 0); }
}
@keyframes flameFlicker {
  0% { transform: scale(0.95); opacity: 0.78; }
  50% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(0.92); opacity: 0.72; }
}
@keyframes smokeRiseA {
  0% { transform: translate(0, 0) scale(0.95); opacity: 0.85; }
  100% { transform: translate(8px, -10px) scale(1.15); opacity: 0; }
}
@keyframes smokeRiseB {
  0% { transform: translate(0, 0) scale(0.9); opacity: 0.76; }
  100% { transform: translate(10px, -13px) scale(1.2); opacity: 0; }
}
@keyframes smokeRiseC {
  0% { transform: translate(0, 0) scale(0.85); opacity: 0.66; }
  100% { transform: translate(12px, -16px) scale(1.25); opacity: 0; }
}
.stage-connector {
  stroke: #94a3b8;
  stroke-width: 2;
  stroke-dasharray: 4 4;
}
.stage-anchor {
  fill: #e2e8f0;
  stroke: #475569;
  stroke-width: 2;
}
.stage-marker {
  cursor: pointer;
}
.stage-marker:hover {
  filter: brightness(1.06);
}
.marker-shadow {
  fill: rgba(15, 23, 42, 0.2);
}
.marker-index {
  font-size: 17px;
  text-anchor: middle;
  fill: #fff;
  font-weight: 800;
}
.marker-date {
  font-size: 11px;
  text-anchor: middle;
  fill: rgba(255, 255, 255, 0.95);
  font-weight: 600;
}
.stage-callout {
  cursor: pointer;
}
.stage-callout:hover .callout-title {
  fill: #0f172a;
}
.callout-line {
  stroke: #94a3b8;
  stroke-width: 1.4;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.callout-box {
  fill: rgba(255, 255, 255, 0.99);
  stroke: #cfdceb;
  stroke-width: 1.2;
}
.callout-title {
  font-size: 14px;
  font-weight: 400;
  fill: #1e293b;
  font-family: 'Inter', sans-serif;
}
.callout-desc {
  font-size: 11px;
  fill: #64748b;
  font-family: 'Inter', sans-serif;
  font-weight: 400;
}

</style>
