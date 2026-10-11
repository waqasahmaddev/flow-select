<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { setups } from './demos.js';

const props = defineProps({
  setup: { type: String, default: '' },
  inline: { type: Boolean, default: false },
  log: { type: Boolean, default: false }
});

const host = ref(null);
const lines = ref([]);
let library = null;
let detach = null;

function record(event) {
  const value = Array.isArray(event.detail?.value) ? `[${event.detail.value.join(', ')}]` : `"${event.detail?.value ?? event.target.value}"`;
  lines.value = [`${event.type}  ${value}`, ...lines.value].slice(0, 6);
}

onMounted(async () => {
  library = await import('flow-select');
  const node = host.value;
  if (props.setup && setups[props.setup]) {
    setups[props.setup](node, library.FlowSelect);
  }
  library.FlowSelect.init(node);
  if (props.log) {
    const names = ['change', 'flowselect:change', 'flowselect:open', 'flowselect:close', 'flowselect:create'];
    names.forEach((name) => node.addEventListener(name, record));
    detach = () => names.forEach((name) => node.removeEventListener(name, record));
  }
});

onBeforeUnmount(() => {
  detach?.();
  if (library && host.value) {
    library.FlowSelect.destroy(host.value);
  }
});
</script>

<template>
  <div class="fs-demo">
    <div ref="host" :class="['fs-demo-body', { 'fs-demo-inline': inline }]">
      <slot />
    </div>
    <ol v-if="log" class="fs-demo-log">
      <li v-if="!lines.length" class="fs-demo-log-empty">Events appear here.</li>
      <li v-for="(line, index) in lines" :key="index">{{ line }}</li>
    </ol>
  </div>
</template>
