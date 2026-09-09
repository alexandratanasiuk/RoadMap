<template>
  <ExcelQuarterTableView @editBlock="(block) => emit('editBlock', block)" />
</template>

<script setup>
import ExcelQuarterTableView from '@/components/views/ExcelQuarterTableView.vue'

// Легкая обертка над полноценной табличной реализацией.
const emit = defineEmits(['editBlock'])
</script>

<style scoped>
.table-view {
  height: 100%;
  display: flex;
}

.table-wrap {
  flex: 1;
  overflow: auto;
  background: #ffffff;
}

.excel-like-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  min-width: 920px;
  font-size: 0.78rem;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #f8fafc;
  border-bottom: 2px solid #3b82f6;
  padding: 10px 8px;
  color: #0f172a;
  text-align: left;
}

thead th.sticky-left {
  z-index: 11;
}

th,
td {
  border-right: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  padding: 8px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

thead th:last-child,
td:last-child {
  border-right: none;
}

.sticky-left {
  position: sticky;
  left: 0;
  background: #ffffff;
  z-index: 5;
}

.col-stage {
  width: 250px;
}
.col-task {
  width: 340px;
}
.col-status {
  width: 120px;
}
.col-start,
.col-release {
  width: 140px;
}
.col-effort {
  width: 110px;
}

.stage-cell {
  font-weight: 800;
  color: #0f172a;
  background: #f8fafc;
}

.task-title {
  display: inline-block;
  max-width: 100%;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 4px;
}

.task-title.is-readonly {
  cursor: default;
  padding: 0;
}

.task-title:hover {
  background: #eff6ff;
  outline: 1px solid #bfdbfe;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 4px 8px;
  font-weight: 700;
  font-size: 0.72rem;
  line-height: 1;
  border: 1px solid rgba(0, 0, 0, 0.04);
  cursor: pointer;
  user-select: none;
}

.status-chip.is-disabled {
  cursor: default;
}

.empty-tasks-cell {
  background: #ffffff;
  color: #94a3b8;
  text-align: left;
  font-style: italic;
}

.effort-cell {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.date-cell {
  text-align: left;
}
</style>

