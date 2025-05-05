document.addEventListener('DOMContentLoaded', function() {
  // Create the preloader
  const preloader = document.createElement('div');
  preloader.className = 'loading-screen';

  // Create sparkles container
  const sparklesContainer = document.createElement('div');
  sparklesContainer.className = 'sparkles';

  // Add sparkle elements
  for (let i = 0; i < 4; i++) {
    const sparkle = document.createElement('div');
    sparkle.className = 'sparkle';
    sparklesContainer.appendChild(sparkle);
  }

  // Create steam effect
  const steamContainer = document.createElement('div');
  steamContainer.className = 'steam';

  // Add steam particles
  for (let i = 0; i < 3; i++) {
    const steamParticle = document.createElement('div');
    steamParticle.className = 'steam-particle';
    steamContainer.appendChild(steamParticle);
  }

  // Create cup container
  const cupContainer = document.createElement('div');
  cupContainer.className = 'cup-container';

  // Create cup image
  const cupImage = document.createElement('img');
  cupImage.src = '/images/cup.jpg';
  cupImage.alt = 'Coffee Cup';
  cupImage.className = 'cup-image rotating-cup';

  // Create loading bar container
  const loadingBarContainer = document.createElement('div');
  loadingBarContainer.className = 'loading-bar-container';

  // Create loading bar
  const loadingBar = document.createElement('div');
  loadingBar.className = 'loading-bar';

  // Create loading text
  const loadingText = document.createElement('div');
  loadingText.className = 'loading-text';
  loadingText.textContent = 'Loading... 0%';

  // Assemble the preloader
  cupContainer.appendChild(cupImage);
  loadingBarContainer.appendChild(loadingBar);

  preloader.appendChild(sparklesContainer);
  preloader.appendChild(steamContainer);
  preloader.appendChild(cupContainer);
  preloader.appendChild(loadingBarContainer);
  preloader.appendChild(loadingText);

  document.body.appendChild(preloader);

  // Hide the main content initially
  const landingWrapper = document.querySelector('.landing-wrapper');
  if (landingWrapper) {
    landingWrapper.classList.add('hidden');
  }

  // Preload the background image
  const bgImage = new Image();
  bgImage.src = '/images/Barseat.png';

  // Update loading progress
  let progress = 0;
  const totalTime = 3000; // 3 seconds total
  const interval = 50; // Update every 50ms
  const increment = (interval / totalTime) * 100;

  const progressInterval = setInterval(function() {
    progress += increment;
    if (progress >= 100) {
      progress = 100;
      clearInterval(progressInterval);

      // Complete loading
      setTimeout(function() {
        // Fade out preloader
        preloader.style.opacity = '0';
        preloader.style.transition = 'opacity 0.5s ease';

        // Show main content
        if (landingWrapper) {
          landingWrapper.classList.remove('hidden');

          // Add shine effect to landing page
          const shineEffect = document.createElement('div');
          shineEffect.className = 'shine-effect';
          landingWrapper.appendChild(shineEffect);
        }

        // Remove preloader after transition
        setTimeout(function() {
          preloader.remove();
        }, 500);
      }, 200);
    }

    // Update loading bar and text
    loadingBar.style.width = `${progress}%`;
    loadingText.textContent = `Loading... ${Math.round(progress)}%`;
  }, interval);

  // Prevent page zoom and orientation change
  document.documentElement.style.touchAction = 'manipulation';
  document.documentElement.style.overflow = 'hidden';

  // Lock orientation if supported
  if (typeof screen.orientation !== 'undefined' && screen.orientation.lock) {
    screen.orientation.lock('portrait').catch(() => {
      // Silently fail if permission denied or not supported
    });
  }
});
