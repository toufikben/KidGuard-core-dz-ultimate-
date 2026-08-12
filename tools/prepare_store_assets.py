from pathlib import Path
from PIL import Image

root = Path('/home/ubuntu/KidGuard-core-dz-ultimate-/store-assets')
root.mkdir(parents=True, exist_ok=True)

# Exact store icon size.
icon = Image.open(root / 'kidguard-icon-master.png').convert('RGB')
icon = icon.resize((512, 512), Image.Resampling.LANCZOS)
icon.save(root / 'kidguard-icon-512.png', format='PNG', optimize=True)

# Exact feature graphic size, preserving the center and trimming only side edges.
feature = Image.open(root / 'kidguard-feature-graphic.png').convert('RGB')
target_w, target_h = 1024, 500
source_ratio = feature.width / feature.height
target_ratio = target_w / target_h
if source_ratio > target_ratio:
    crop_w = int(feature.height * target_ratio)
    left = (feature.width - crop_w) // 2
    feature = feature.crop((left, 0, left + crop_w, feature.height))
else:
    crop_h = int(feature.width / target_ratio)
    top = (feature.height - crop_h) // 2
    feature = feature.crop((0, top, feature.width, top + crop_h))
feature = feature.resize((target_w, target_h), Image.Resampling.LANCZOS)
feature.save(root / 'kidguard-feature-graphic-1024x500.jpg', format='JPEG', quality=95, optimize=True)

# Store-ready portrait screenshots, normalized to a common 9:16 canvas.
for source in sorted(root.glob('kidguard-screenshot-*.png')):
    if source.name.startswith('kidguard-screenshot-'):
        image = Image.open(source).convert('RGB')
        image = image.resize((1080, 1920), Image.Resampling.LANCZOS)
        output = source.with_name(source.stem + '-1080x1920.jpg')
        image.save(output, format='JPEG', quality=95, optimize=True)

print('Prepared store assets:')
for path in sorted(root.glob('*512.png')):
    print(path.name, Image.open(path).size)
for path in sorted(root.glob('*1024x500.jpg')):
    print(path.name, Image.open(path).size)
for path in sorted(root.glob('*1080x1920.jpg')):
    print(path.name, Image.open(path).size)
