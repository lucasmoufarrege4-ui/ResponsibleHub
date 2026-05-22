#!/usr/bin/env python3
"""
Generate icon.png (512x512) and favicon.ico (32x32) for ResponsibleHub.
Pure stdlib — struct + zlib only.
"""
import struct, zlib, math

# ── PNG writer ───────────────────────────────────────────────────────
def save_png(path, rows, w, h):
    def chunk(tag, data):
        payload = tag + data
        return (struct.pack('>I', len(data)) + payload +
                struct.pack('>I', zlib.crc32(payload) & 0xFFFFFFFF))
    ihdr  = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)   # 8-bit RGBA
    raw   = bytearray()
    for row in rows:
        raw.append(0)                                        # filter: None
        for (r,g,b,a) in row:
            raw += bytes([r, g, b, a])
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', zlib.compress(bytes(raw), 9)))
        f.write(chunk(b'IEND', b''))

# ── ICO writer (modern: embeds PNG directly) ─────────────────────────
def save_ico(path, png_bytes, size):
    header = struct.pack('<HHH', 0, 1, 1)                   # ICONDIR
    entry  = struct.pack('<BBBBHHII',
        size if size < 256 else 0, size if size < 256 else 0,
        0, 0, 1, 32, len(png_bytes), 6 + 16)               # ICONDIRENTRY
    with open(path, 'wb') as f:
        f.write(header + entry + png_bytes)

# ── Canvas helpers ───────────────────────────────────────────────────
def make_canvas(w, h):
    return [[(0,0,0,0)] * w for _ in range(h)]

def blend(cvs, x, y, r, g, b, a):
    W, H = len(cvs[0]), len(cvs)
    if not (0 <= x < W and 0 <= y < H): return
    er,eg,eb,ea = cvs[y][x]
    sa = a/255.0; da = ea/255.0
    oa = sa + da*(1-sa)
    if oa <= 0: return
    cvs[y][x] = (
        min(255, int((r*sa + er*da*(1-sa))/oa)),
        min(255, int((g*sa + eg*da*(1-sa))/oa)),
        min(255, int((b*sa + eb*da*(1-sa))/oa)),
        min(255, int(oa*255)))

# ── Cubic bezier ─────────────────────────────────────────────────────
def bezier(p0,p1,p2,p3, steps=400):
    pts=[]
    for i in range(steps+1):
        t=i/steps; u=1-t
        pts.append((
            u**3*p0[0]+3*u**2*t*p1[0]+3*u*t**2*p2[0]+t**3*p3[0],
            u**3*p0[1]+3*u**2*t*p1[1]+3*u*t**2*p2[1]+t**3*p3[1]))
    return pts

# ── Scanline polygon fill ────────────────────────────────────────────
def fill_poly(cvs, poly, color_fn, W, H):
    ys = [int(p[1]) for p in poly]
    n = len(poly)
    for y in range(max(0,min(ys)), min(H, max(ys)+1)):
        xs=[]
        for i in range(n):
            x1,y1=poly[i]; x2,y2=poly[(i+1)%n]
            if (y1<=y<y2) or (y2<=y<y1):
                xs.append(x1+(y-y1)*(x2-x1)/(y2-y1))
        xs.sort()
        for i in range(0,len(xs)-1,2):
            for x in range(max(0,int(xs[i])), min(W,int(xs[i+1])+1)):
                blend(cvs, x, y, *color_fn(x,y))

# ── Thick line (with AA fringe) ──────────────────────────────────────
def draw_line(cvs, x0,y0,x1,y1, col, w_px, W, H):
    r,g,b,a = col
    dx=x1-x0; dy=y1-y0
    L=math.sqrt(dx*dx+dy*dy)
    if L<1e-9: return
    nx=-dy/L; ny=dx/L
    half=w_px/2
    for i in range(int(L)+2):
        t=i/max(1,int(L)+1)
        cx=x0+t*dx; cy=y0+t*dy
        for d in range(-int(half)-2, int(half)+3):
            dist=abs(d)
            aa=255 if dist<half else int((half+1-dist)*255) if dist<half+1 else 0
            if aa<=0: continue
            blend(cvs, int(cx+d*nx), int(cy+d*ny), r,g,b, int(a*aa//255))

# ── Bitmap glyph helpers — draw R and H from strokes ────────────────
def stroke_rect(cvs, x,y,w2,h2, col, W, H):
    r,g,b,a=col
    for py in range(max(0,int(y)), min(H,int(y+h2)+1)):
        for px in range(max(0,int(x)), min(W,int(x+w2)+1)):
            blend(cvs,px,py,r,g,b,a)

def draw_R(cvs, ox,oy, lh, lw, sw, col, W, H):
    # vertical stem
    stroke_rect(cvs, ox, oy, sw, lh, col, W, H)
    # bump (D shape) — top half
    bh = lh * 0.44
    bw = lw - sw
    cx2 = ox+sw+bw/2; cy2 = oy+bh/2
    ro = bh/2; ri = max(0, ro-sw)
    for py in range(max(0,int(oy)), min(H,int(oy+bh)+1)):
        dy2 = py-cy2
        if abs(dy2)>ro: continue
        ox2 = cx2+math.sqrt(max(0,ro**2-dy2**2))
        ix2 = cx2+math.sqrt(max(0,ri**2-dy2**2)) if ri>0 else cx2
        # horizontal caps
        if py<=int(oy)+int(sw) or py>=int(oy+bh)-int(sw):
            stroke_rect(cvs, ox+sw, py, bw+1, 1, col, W, H)
        else:
            for px in range(max(int(cx2),int(ix2)), min(W, int(ox2)+1)):
                blend(cvs,px,py,*col)
    # diagonal leg
    lx0=ox+sw+bw*0.05; ly0=oy+bh-sw*0.3
    lx1=ox+lw+sw*0.2;  ly1=oy+lh
    draw_line(cvs, lx0,ly0,lx1,ly1, col, sw*1.05, W, H)

def draw_H(cvs, ox,oy, lh, lw, sw, col, W, H):
    stroke_rect(cvs, ox,      oy, sw, lh,        col, W, H)  # left stem
    stroke_rect(cvs, ox+lw,   oy, sw, lh,        col, W, H)  # right stem
    my = oy+lh*0.44
    stroke_rect(cvs, ox, my, lw+sw, sw*1.05, col, W, H)       # crossbar

# ── Main render function ─────────────────────────────────────────────
def render(size):
    W = H = size
    cvs = make_canvas(W, H)
    cx = cy = W / 2
    r  = W * 0.43

    # ── Leaf polygon ────────────────────────────────────────
    top=(cx, cy-r); bot=(cx, cy+r)
    rpts = bezier(top, (cx+r*.72,cy-r*.72), (cx+r*.98,cy+r*.12), bot)
    lpts = bezier(bot, (cx-r*.98,cy+r*.12), (cx-r*.72,cy-r*.72), top)
    poly = rpts + lpts

    # gradient: #74c69d → #40916c → #1b4332
    def leaf_col(px,py):
        t = ((px-(cx-r*.6))/(r*1.4) + (py-(cy-r))/(r*2.0))/2
        t = max(0,min(1,t))
        if t<0.4:
            s=t/0.4
            return (int(116+s*(64-116)), int(198+s*(145-198)), int(157+s*(108-157)), 255)
        else:
            s=(t-.4)/.6
            return (int(64+s*(27-64)), int(145+s*(67-145)), int(108+s*(50-108)), 255)

    fill_poly(cvs, poly, leaf_col, W, H)

    # ── Centre vein ─────────────────────────────────────────
    draw_line(cvs, cx,cy-r*.78, cx,cy+r*.82, (255,255,255,48), W*.022, W,H)

    # ── Side veins ──────────────────────────────────────────
    sv = [(.04,-.5,.36,-.28),(.04,-.2,.42,.02),(-.04,-.5,-.36,-.28),(-.04,-.2,-.42,.02)]
    for (x1,y1,x2,y2) in sv:
        draw_line(cvs, cx+x1*r,cy+y1*r, cx+x2*r,cy+y2*r, (255,255,255,40), W*.012, W,H)

    # ── "RH" letters ────────────────────────────────────────
    lh  = W * 0.295      # letter height
    lw  = W * 0.125      # letter width (cap width)
    sw  = max(2, W*.032) # stroke width
    gap = W * 0.030      # gap between letters
    col = (255,255,255,248)

    total = lw*2 + sw + gap
    lx = cx - total/2
    ly = cy - lh/2 + W*.02

    draw_R(cvs, lx,        ly, lh, lw, sw, col, W, H)
    draw_H(cvs, lx+lw+gap, ly, lh, lw, sw, col, W, H)

    return cvs

# ── Generate 512×512 icon.png ────────────────────────────────────────
print("Rendering 512×512…")
c512 = render(512)
save_png('/Users/lucas/ResponsibilityHub/icon.png', c512, 512, 512)
print("  ✓ icon.png")

# ── Generate 32×32 favicon.ico ───────────────────────────────────────
print("Rendering 32×32…")
c32 = render(32)
import tempfile, os
tmp = tempfile.mktemp(suffix='.png')
save_png(tmp, c32, 32, 32)
with open(tmp,'rb') as f: png32=f.read()
os.unlink(tmp)
save_ico('/Users/lucas/ResponsibilityHub/favicon.ico', png32, 32)
print("  ✓ favicon.ico")
print("Done.")
