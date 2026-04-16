import { onBeforeUnmount, ref } from "vue";

// Shared 1s ticker. Every component that calls useNow() reads the same ref;
// the interval runs only while at least one component has it mounted.
const now = ref(Date.now());
let refCount = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function useNow() {
  refCount++;
  if (timer === null) {
    timer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
  }

  onBeforeUnmount(() => {
    refCount--;
    if (refCount === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  });

  return now;
}
