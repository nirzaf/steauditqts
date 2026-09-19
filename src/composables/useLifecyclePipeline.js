/**
 * useLifecyclePipeline — Vue wrapper around the single mode-aware lifecycle
 * projection (src/composables/lifecycleProjection.js).
 *
 * LOCAL_ONLY derives the 11 stage states from the browser-local scenario;
 * SHARED_DEMO derives them from the D1 progress snapshot. The caller passes the
 * snapshot in, and the projection never mixes the two inputs.
 *
 * @param {string|null} engagementId — engagement to evaluate (defaults to selectedEngagementId)
 * @param {import('vue').Ref<object|null>|object|null} sharedProgress — D1 progress snapshot
 */
import { computed, unref } from 'vue';
import { deriveStageStates } from './lifecycleProjection.js';
import { scenario } from '../domain/scenario.js';

export function useLifecyclePipeline(engagementId = null, sharedProgress = null) {
  const stageStates = computed(() =>
    deriveStageStates({
      state: scenario,
      engagementId: engagementId || scenario.selectedEngagementId,
      progress: unref(sharedProgress) || null,
    }),
  );

  return { stageStates };
}
