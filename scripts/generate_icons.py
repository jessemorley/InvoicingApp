#!/usr/bin/env python3
"""Generate macOS AppIcon sizes from the PWA icon with iOS-style treatment."""

import math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import os

SRC = "/Users/jmorley/dev/invoicing-app/pwa/icon-512.png"
OUT_DIR = "/Users/jmorley/dev/invoicing-app/InvoicingApp/Resources/Assets.xcassets/AppIcon.appiconset"

SIZES = [
    ("icon_16x16.png",      16),
    ("icon_16x16@2x.png",   32),
    ("icon_32x32.png",      32),
    ("icon_32x32@2x.png",   64),
    ("icon_128x128.png",    128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png",    256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png",    512),
    ("icon_512x512@2x.png", 1024),
]

MASTER_SIZE = 1024


def make_ios_icon(size: int) -> Image.Image:
    src = Image.open(SRC).convert("RGBA")

    # --- 1. Background: dark base + subtle radial gradient lightening toward top-center ---
    bg = Image.new("RGBA", (size, size), (28, 28, 30, 255))  # near-black base

    # Radial gradient overlay (lighter at top-center, fades out)
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(grad)
    cx, cy = size * 0.5, size * 0.28  # center of radial slightly above middle
    max_r = size * 0.72

    steps = 80
    for i in range(steps, 0, -1):
        t = i / steps
        r = int(max_r * t)
        # light warm-neutral, very subtle
        alpha = int(38 * (1 - t) ** 1.4)
        color = (255, 255, 240, alpha)
        bbox = [int(cx - r), int(cy - r), int(cx + r), int(cy + r)]
        draw.ellipse(bbox, fill=color)

    bg = Image.alpha_composite(bg, grad)

    # --- 2. Scale and composite the logo ---
    # Logo padding: ~13% on each side (iOS default)
    pad = int(size * 0.13)
    logo_size = size - 2 * pad
    logo = src.resize((logo_size, logo_size), Image.LANCZOS)

    # --- 3. Subtle white glow/outline around the logo shape ---
    # Extract alpha of logo, blur it slightly, composite as a soft halo
    logo_alpha = logo.split()[3]
    halo = Image.new("RGBA", (logo_size, logo_size), (0, 0, 0, 0))
    halo.putalpha(logo_alpha)
    # Expand + blur for glow
    blur_r = max(1, size // 80)
    glow_alpha = logo_alpha.filter(ImageFilter.GaussianBlur(radius=blur_r * 2))
    # Dilate: paste expanded alpha
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_layer = Image.new("RGBA", (logo_size, logo_size), (255, 255, 255, 0))
    glow_layer.putalpha(glow_alpha)
    # Tint white at low opacity
    white_glow = Image.new("RGBA", (logo_size, logo_size), (255, 255, 255, 60))
    white_glow.putalpha(glow_alpha)
    glow.paste(white_glow, (pad, pad))
    bg = Image.alpha_composite(bg, glow)

    # --- 4. Paste logo onto background ---
    bg.paste(logo, (pad, pad), logo)

    # --- 5. Subtle inner highlight: thin crescent at top of the whole icon ---
    highlight = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(highlight)
    # Outer ellipse (full icon)
    inset = max(1, size // 128)
    hdraw.ellipse([inset, inset, size - inset, size - inset],
                  outline=(255, 255, 255, 28), width=max(1, size // 180))
    bg = Image.alpha_composite(bg, highlight)

    return bg.convert("RGB")  # macOS icons are opaque squares (no rounded corners in asset)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for filename, size in SIZES:
        icon = make_ios_icon(size)
        out_path = os.path.join(OUT_DIR, filename)
        icon.save(out_path, "PNG", optimize=True)
        print(f"  {filename} ({size}x{size})")
    print("Done.")


if __name__ == "__main__":
    main()
