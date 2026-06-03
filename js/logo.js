paper.setup('logo-canvas');

const LOGO_URL = 'logo.svg';
const PADDING = 0.9;

let logoItem = null;

function fitLogo(item) {
  const target = paper.view.bounds.scale(PADDING);
  item.fitBounds(target, true);
  item.position = paper.view.center;
}

function placeLogo(item) {
  if (logoItem) {
    logoItem.remove();
  }
  logoItem = item;
  fitLogo(logoItem);

  paper.view.onFrame = startBranchAnimations(logoItem);
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
