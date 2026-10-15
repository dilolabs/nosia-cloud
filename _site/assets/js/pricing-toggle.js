// Pricing Toggle Functionality
document.addEventListener('DOMContentLoaded', function() {
  const toggleOptions = document.querySelectorAll('.toggle-option');
  const monthlyPrices = document.querySelectorAll('.price.monthly');
  const annualPrices = document.querySelectorAll('.price.annual');

  toggleOptions.forEach(option => {
    option.addEventListener('click', function() {
      const billing = this.getAttribute('data-billing');
      
      // Update active state
      toggleOptions.forEach(opt => opt.classList.remove('active'));
      this.classList.add('active');
      
      // Toggle price visibility
      if (billing === 'monthly') {
        monthlyPrices.forEach(price => price.classList.remove('hidden'));
        annualPrices.forEach(price => price.classList.add('hidden'));
      } else {
        monthlyPrices.forEach(price => price.classList.add('hidden'));
        annualPrices.forEach(price => price.classList.remove('hidden'));
      }
    });
  });

  // Mobile navigation toggle (if needed)
  const navToggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('.nav');
  
  if (navToggle && nav) {
    navToggle.addEventListener('click', function() {
      nav.classList.toggle('mobile-open');
    });
  }
});