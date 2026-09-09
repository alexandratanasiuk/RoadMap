<template>
  <div class="main-content">
    <slot />
  </div>
</template>

<script setup>
// Лэйаут-обертка центральной области: дает единый контейнер для всех view.
</script>

<style scoped>
.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 5px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  position: relative;
}
</style>