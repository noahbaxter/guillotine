// Shared animation and configuration utilities for Guillotine plugin

export const GUILLOTINE_CONFIG = {
  dropDuration: 150,   // Fast drop (guillotine fall)
  raiseDuration: 600,  // Slower raise (pulling back up)
};

export const LEVER_CONFIG = {
  dropDuration: 80,    // Quick snap down
  raiseDuration: 100,  // Quick snap up (constant motion)
};

/**
 * Animate from startValue to targetValue with direction-aware easing.
 * Easing: fast drop (ease-in), slower raise (ease-out).
 * Returns a cleanup function to cancel the animation.
 */
export function animateValue(startValue, targetValue, options = {}) {
  const {
    dropDuration = GUILLOTINE_CONFIG.dropDuration,
    raiseDuration = GUILLOTINE_CONFIG.raiseDuration,
    onFrame = () => {},
    onComplete = () => {},
  } = options;

  const isDropping = targetValue > startValue;
  const delta = targetValue - startValue;
  const duration = isDropping ? dropDuration : raiseDuration;
  const startTime = performance.now();
  let animationId = null;

  const animate = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Easing: fast drop (ease-in), slower raise (ease-out)
    const eased = isDropping
      ? progress * progress  // ease-in for drop
      : 1 - Math.pow(1 - progress, 2);  // ease-out for raise

    const currentValue = startValue + delta * eased;
    onFrame(currentValue);

    if (progress < 1) {
      animationId = requestAnimationFrame(animate);
    } else {
      animationId = null;
      onComplete();
    }
  };

  animationId = requestAnimationFrame(animate);

  // Return cleanup function
  return () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };
}

/**
 * Animate lever with constant speed (linear easing).
 * Lever moves quickly in both directions without gravity-based easing.
 */
export function animateLever(startValue, targetValue, options = {}) {
  const {
    dropDuration = LEVER_CONFIG.dropDuration,
    raiseDuration = LEVER_CONFIG.raiseDuration,
    onFrame = () => {},
    onComplete = () => {},
  } = options;

  const isDropping = targetValue > startValue;
  const delta = targetValue - startValue;
  const duration = isDropping ? dropDuration : raiseDuration;
  const startTime = performance.now();
  let animationId = null;

  const animate = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Linear easing - constant speed motion
    const currentValue = startValue + delta * progress;
    onFrame(currentValue);

    if (progress < 1) {
      animationId = requestAnimationFrame(animate);
    } else {
      animationId = null;
      onComplete();
    }
  };

  animationId = requestAnimationFrame(animate);

  // Return cleanup function
  return () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };
}
