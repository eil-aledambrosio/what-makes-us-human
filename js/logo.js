paper.setup('logo-canvas');

const LOGO_URL = 'logo.svg';

let logoItem = null;

function fitLogo(item) {
  const isMobile = paper.view.bounds.width < 600;
  const padding = isMobile ? 0.4 : 0.85;
  const target = paper.view.bounds.scale(padding);
  item.fitBounds(target, true);
  item.position = paper.view.center;
}

function placeLogo(item) {
  if (logoItem) {
    logoItem.remove();
  }
  logoItem = item;
  logoItem.applyMatrix = false;
  fitLogo(logoItem);

  paper.view.onFrame = startBranchAnimations(logoItem);

  if (window.textSwitcherInit) {
    window.textSwitcherInit(logoItem);
  }
}

paper.project.importSVG(LOGO_URL, {
  expand: true,
  onLoad: placeLogo,
  onError: () => console.error('Impossibile caricare', LOGO_URL),
});

paper.view.onResize = () => {
  if (logoItem) {
    fitLogo(logoItem);
  }
};
