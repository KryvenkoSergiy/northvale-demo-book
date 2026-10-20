# Builds lodge.glb: a stylized log cabin in scene units (the island's lodge pad is ~2 across), in the spirit of the
# Quaternius nature models: round logs, chunky bevelled boards and stones, a shingle roof, small hand-made details.
# Run: /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/lodge.py -- <out.glb>
# then the same gltf-transform optimize as the other models (docs/work-demos.md)
# Blender is Z-up with the front facing -Y; the glTF exporter turns that into Y-up with the front facing +Z.
# Materials carry `texture` extras ("bark", "rock"): the scene maps its own textures onto them, so the file has none.
import math
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

OUT = sys.argv[sys.argv.index("--") + 1]
rnd = random.Random(4)

MATERIALS = {
    # name: (colour, texture). Textured colours tint the texture.
    "Wood": ("#ffffff", "bark"),
    "Plank": ("#e2c9a6", "bark"),
    "DarkWood": ("#9a8577", "bark"),
    "Roof": ("#8e8c96", "bark"),
    "RoofDark": ("#74727d", "bark"),
    "Stone": ("#ffffff", "rock"),
    "EndGrain": ("#d9b886", None),
    "Trim": ("#ece4d4", None),
    "Shutter": ("#5d7a55", None),
    "Iron": ("#2f2b27", None),
    "Flower": ("#e68aa6", None),
    "FlowerY": ("#f0cc58", None),
    "Leaf": ("#5c8a3a", None),
    # The scene swaps this one for its own emissive material, so windows and the lantern light up at night.
    "Window": ("#2a2622", None),
}
NAMES = list(MATERIALS)
TILE = 0.35  # texture repeat, in metres

R = 0.055  # log radius
STEP = 0.1  # course spacing; under 2R, so logs overlap without gaps
N = 8  # courses
W, D = 1.6, 1.0  # log centre lines
OH = 0.09  # log ends past the corners
BASE = 0.12  # top of the stone footing
TOPW = BASE + R + (N - 1) * STEP + STEP / 2 + R
RH = 0.6  # ridge above the wall top
PITCH = math.atan2(RH, D / 2 + R)

bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new()
uv = bm.loops.layers.uv.new("UVMap")


def made(build):
    before = set(bm.faces)
    build()
    faces = [f for f in bm.faces if f not in before]
    for f in faces:
        f.normal_update()
    return faces


def place(faces, matrix):
    bmesh.ops.transform(bm, matrix=matrix, verts=list({v for f in faces for v in f.verts}))


def project(faces, grain):
    """Box-projects UVs; the texture's streaks run along `grain` (0 x, 1 y, 2 z) wherever a face contains it."""
    for f in faces:
        d = max(range(3), key=lambda i: abs(f.normal[i]))
        a, b = [i for i in range(3) if i != d]
        for loop in f.loops:
            co = loop.vert.co
            if grain in (a, b):
                other = a if grain == b else b
                loop[uv].uv = (co[other] / TILE, co[grain] / TILE)
            else:
                loop[uv].uv = (co[a] / TILE, co[b] / TILE)


def box(mat, size, at, grain=0, bevel=0.0, rot=None):
    """A box of `size`, centred at `at`, optionally rotated by the 3×3 `rot`; built and UV'd in local space."""

    def build():
        g = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=size, verts=g["verts"])
        if bevel:
            edges = list({e for v in g["verts"] for e in v.link_edges})
            bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)

    faces = made(build)
    for f in faces:
        f.material_index = NAMES.index(mat)
    project(faces, grain)
    place(faces, Matrix.Translation(at) @ (rot.to_4x4() if rot else Matrix.Identity(4)))


def log(mat, length, radius, at, axis, segs=8, cap="EndGrain"):
    """A round log along `axis` ("x", "y", "z") with end-grain caps; the texture's streaks run along it."""
    faces = made(lambda: bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=radius, radius2=radius, depth=length))
    for f in faces:
        is_cap = abs(f.normal.z) > 0.9
        f.material_index = NAMES.index(cap if is_cap else mat)
        f.smooth = not is_cap
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co.x / TILE, co.y / TILE) if is_cap else ((math.atan2(co.y, co.x) / (2 * math.pi)) % 1.0, co.z / TILE)
        us = [loop[uv].uv.x for loop in f.loops]
        # The face across the seam would squeeze the whole texture into one strip.
        if not is_cap and max(us) - min(us) > 0.5:
            for loop in f.loops:
                if loop[uv].uv.x < 0.5:
                    loop[uv].uv.x += 1
    turn = {"x": Matrix.Rotation(math.pi / 2, 4, "Y"), "y": Matrix.Rotation(math.pi / 2, 4, "X"), "z": Matrix.Identity(4)}[axis]
    place(faces, Matrix.Translation(at) @ turn)


def blob(mat, radius, at):
    faces = made(lambda: bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius))
    for f in faces:
        f.material_index = NAMES.index(mat)
    project(faces, 2)
    place(faces, Matrix.Translation(at))


def prism(mat, pts, dx, grain=2):
    """Extrudes a polygon given in the YZ plane along +x by dx."""

    def build():
        a = [bm.verts.new(p) for p in pts]
        b = [bm.verts.new((p[0] + dx, p[1], p[2])) for p in pts]
        bm.faces.new(list(reversed(a)))
        bm.faces.new(b)
        for i in range(len(pts)):
            j = (i + 1) % len(pts)
            bm.faces.new((a[i], a[j], b[j], b[i]))

    faces = made(build)
    for f in faces:
        f.material_index = NAMES.index(mat)
    project(faces, grain)


# Walls are addressed as (along, out): `along` runs left to right seen from outside, `out` away from the log centre line.
WALLS = {
    "front": (lambda a, o, z: Vector((a, -D / 2 - o, z)), 0),
    "back": (lambda a, o, z: Vector((-a, D / 2 + o, z)), 0),
    "right": (lambda a, o, z: Vector((W / 2 + o, a, z)), 1),
    "left": (lambda a, o, z: Vector((-W / 2 - o, -a, z)), 1),
}


def wall_box(wall, mat, along, out, z, s_along, s_out, s_z, grain="along", bevel=0.0):
    to, axis = WALLS[wall]
    size = (s_along, s_out, s_z) if axis == 0 else (s_out, s_along, s_z)
    g = {"along": axis, "z": 2, "out": 1 - axis}[grain]
    box(mat, size, to(along, out, z), g, bevel)


# Openings: wall, centre along it, width, bottom, top.
DOOR = ("front", 0.0, 0.28, BASE, BASE + 0.58)
WINDOWS = [
    ("front", -0.48, 0.26, 0.42, 0.72),
    ("front", 0.48, 0.26, 0.42, 0.72),
    ("right", 0.0, 0.34, 0.42, 0.72),
    ("left", 0.0, 0.34, 0.42, 0.72),
    ("back", 0.25, 0.3, 0.42, 0.72),
]
CASING = 0.04

# --- Footing: a core under the logs and a ring of rough stones round it -----------------------------------------
box("Stone", (W + 2 * R + 0.02, D + 2 * R + 0.02, BASE + 0.15), (0, 0, (BASE - 0.15) / 2), bevel=0.02)
for wall, length in (("front", W), ("back", W), ("right", D), ("left", D)):
    to, axis = WALLS[wall]
    a = -length / 2 - R
    while a < length / 2 + R - 0.05:
        s = rnd.uniform(0.13, 0.2)
        h = rnd.uniform(0.1, 0.16)
        size = (s, rnd.uniform(0.07, 0.1), h) if axis == 0 else (rnd.uniform(0.07, 0.1), s, h)
        spin = Matrix.Rotation(rnd.uniform(-0.12, 0.12), 3, "Z")
        box("Stone", size, to(a + s / 2, R + 0.02, BASE - h / 2 + rnd.uniform(-0.01, 0.02)), bevel=0.02, rot=spin)
        a += s + 0.01

# --- Log walls, cut round the openings; front/back and side courses interleave at the corners -------------------
box("DarkWood", (W, D, TOPW - BASE), (0, 0, (BASE + TOPW) / 2), grain=0)
openings = [DOOR] + WINDOWS
for i in range(N):
    for wall, (to, axis) in WALLS.items():
        z = BASE + R + i * STEP + (0 if axis == 0 else STEP / 2)
        half = (W if axis == 0 else D) / 2 + OH
        # Logs stop inside the casing boards, which hide their cut ends.
        cuts = sorted((c - w / 2 - CASING / 2, c + w / 2 + CASING / 2) for (wl, c, w, z0, z1) in openings if wl == wall and z + R > z0 and z - R < z1)
        start = -half
        for c0, c1 in cuts + [(half, half)]:
            if c0 - start > 0.03:
                log("Wood", c0 - start, R + rnd.uniform(-0.004, 0.004), to((start + c0) / 2, 0, z), "x" if axis == 0 else "y")
            start = c1

# --- Windows: casing through the wall, recessed glass, a cross, a sill; shutters and flower boxes at the front -----
for wall, c, w, z0, z1 in WINDOWS:
    h = z1 - z0
    zc = (z0 + z1) / 2
    depth = 2 * R + 0.02
    for s in (-1, 1):
        wall_box(wall, "Trim", c + s * (w / 2 + CASING / 2), 0, zc, CASING, depth, h + 2 * CASING, bevel=0.006)
    wall_box(wall, "Trim", c, 0, z1 + CASING / 2, w, depth, CASING, bevel=0.006)
    wall_box(wall, "Trim", c, R * 0.6, z0 - CASING / 2, w + 2 * CASING + 0.04, depth * 0.7 + 0.04, CASING, bevel=0.006)
    wall_box(wall, "Window", c, 0, zc, w, 0.01, h)
    wall_box(wall, "Trim", c, 0.012, zc, 0.022, 0.012, h)
    wall_box(wall, "Trim", c, 0.012, zc, w, 0.012, 0.022)
    if wall == "front":
        to, _ = WALLS[wall]
        for s in (-1, 1):
            sa = c + s * (w / 2 + CASING + 0.055)
            wall_box(wall, "Shutter", sa, R + 0.015, zc, 0.1, 0.024, h + 0.06, grain="z", bevel=0.006)
            for dz in (-0.1, 0.1):
                wall_box(wall, "Shutter", sa, R + 0.03, zc + dz, 0.11, 0.012, 0.03, bevel=0.004)
        wall_box(wall, "Plank", c, R + 0.075, z0 - CASING - 0.045, w + 0.04, 0.09, 0.06, bevel=0.008)
        for k in range(5):
            a = c - w / 2 + 0.04 + k * (w - 0.08) / 4
            blob("Leaf", 0.032, to(a, R + 0.075 + rnd.uniform(-0.02, 0.02), z0 - CASING - 0.005))
            blob("Flower" if k % 2 == 0 else "FlowerY", 0.022, to(a + 0.015, R + 0.07 + rnd.uniform(-0.02, 0.02), z0 - CASING + 0.025))

# --- Door: vertical boards with braces, casing, handle -----------------------------------------------------------
_, c, w, z0, z1 = DOOR
for k in range(4):
    bw = w / 4
    wall_box("front", "Plank", c - w / 2 + bw * (k + 0.5), -0.005, (z0 + z1) / 2, bw - 0.006, 0.035, z1 - z0, grain="z", bevel=0.004)
for dz in (0.12, z1 - z0 - 0.12):
    wall_box("front", "DarkWood", c, 0.02, z0 + dz, w - 0.03, 0.015, 0.04, bevel=0.004)
for s in (-1, 1):
    wall_box("front", "DarkWood", c + s * (w / 2 + CASING / 2), 0, (z0 + z1) / 2 + CASING / 2, CASING, 2 * R + 0.02, z1 - z0 + CASING, grain="z", bevel=0.006)
wall_box("front", "DarkWood", c, 0, z1 + CASING / 2, w + 2 * CASING, 2 * R + 0.02, CASING, bevel=0.006)
wall_box("front", "Iron", c + w / 2 - 0.05, 0.035, (z0 + z1) / 2, 0.025, 0.03, 0.025)

# --- Gables: boards and battens, a small window on the end the camera sees -----------------------------------------
GY = D / 2 + R
for side in (-1, 1):
    x = side * W / 2 - 0.025
    prism("Plank", [(x, -GY, TOPW), (x, GY, TOPW), (x, 0, TOPW + RH)], 0.05)
    for k in range(-3, 4):
        y = k * 0.13
        hgt = RH * (1 - abs(y) / GY) - 0.04
        if hgt > 0.05:
            box("DarkWood", (0.02, 0.025, hgt), (side * (W / 2 + 0.035), y, TOPW + hgt / 2), grain=2)
box("Trim", (0.03, 0.2, 0.2), (W / 2 + 0.05, 0, TOPW + 0.2), bevel=0.006)
box("Window", (0.03, 0.15, 0.15), (W / 2 + 0.058, 0, TOPW + 0.2))
box("Trim", (0.035, 0.018, 0.15), (W / 2 + 0.065, 0, TOPW + 0.2))
box("Trim", (0.035, 0.15, 0.018), (W / 2 + 0.065, 0, TOPW + 0.2))

# --- Roof: underlayment, staggered shingles in two tones, rake boards, ridge log -----------------------------------
GABLE = W / 2 + OH + 0.12  # roof half-length along x
EAVE = 0.2  # overhang along the slope
SLOPE = (D / 2 + R) / math.cos(PITCH) + EAVE


def basis(y_dir, z_dir):
    return Matrix((y_dir.cross(z_dir), y_dir, z_dir)).transposed()


def shingles(eave, up, normal, length, half, rows, lift):
    """Rows of shingles from the eave up; each kicks out at its lower edge so the rows read as steps."""
    row = length / rows
    for k in range(rows):
        x = -half - (0.075 if k % 2 else 0.0)
        while x < half - 0.02:
            sw = min(rnd.uniform(0.13, 0.17), half - x)
            kick = 0.07 + rnd.uniform(-0.02, 0.02)
            y_dir = (up * math.cos(kick) - normal * math.sin(kick)).normalized()
            z_dir = (normal * math.cos(kick) + up * math.sin(kick)).normalized()
            lo = max(x, -half)
            at = eave + up * ((k + 0.5) * row) + normal * lift + Vector(((lo + x + sw) / 2, 0, 0))
            box("RoofDark" if rnd.random() < 0.3 else "Roof", (x + sw - lo - 0.012, row * 1.4, 0.022), at, grain=1, rot=basis(y_dir, z_dir))
            x += sw


for sy in (-1, 1):
    up = Vector((0, -sy * math.cos(PITCH), math.sin(PITCH)))
    normal = Vector((0, sy * math.sin(PITCH), math.cos(PITCH)))
    eave = Vector((0, 0, TOPW + RH)) - up * SLOPE
    box("DarkWood", (2 * GABLE, SLOPE, 0.04), eave + up * (SLOPE / 2), grain=0, rot=basis(up, normal))
    shingles(eave, up, normal, SLOPE, GABLE, 7, 0.035)
    for s in (-1, 1):
        at = eave + up * (SLOPE / 2) + normal * 0.01 + Vector((s * (GABLE + 0.017), 0, 0))
        box("DarkWood", (0.035, SLOPE + 0.04, 0.08), at, grain=1, rot=basis(up, normal), bevel=0.006)
log("Wood", 2 * GABLE + 0.12, 0.05, Vector((0, 0, TOPW + RH + 0.035)), "x")

# --- Chimney through the back slope ----------------------------------------------------------------------------
CX, CY = 0.4, 0.2
ctop = TOPW + RH + 0.3
box("Stone", (0.22, 0.22, ctop - TOPW + 0.1), (CX, CY, (ctop + TOPW - 0.1) / 2), bevel=0.015)
z = TOPW + 0.05
while z < ctop - 0.06:
    for dx, dy in ((0.11, 0), (-0.11, 0), (0, 0.11), (0, -0.11)):
        if rnd.random() < 0.55:
            along = rnd.uniform(0.07, 0.12)
            size = (along, 0.04, rnd.uniform(0.05, 0.08)) if dy else (0.04, along, rnd.uniform(0.05, 0.08))
            jitter = rnd.uniform(-0.03, 0.03)
            box("Stone", size, (CX + dx + (jitter if dy else 0), CY + dy + (0 if dy else jitter), z), bevel=0.012)
    z += 0.08
box("Stone", (0.3, 0.3, 0.05), (CX, CY, ctop + 0.02), bevel=0.012)
box("Iron", (0.12, 0.12, 0.02), (CX, CY, ctop + 0.05))

# --- Porch: deck boards on a beam, log posts and header, rails, steps, a lean-to roof, lantern, bench ------------
P = 0.45
FRONT = -D / 2 - R
PY = FRONT - P + 0.06  # posts
PTOP = BASE + 0.68
box("DarkWood", (1.12, 0.07, 0.09), (0, FRONT - P + 0.04, BASE - 0.065), grain=0, bevel=0.01)
for s in (-1, 1):
    box("Stone", (0.12, 0.12, 0.2), (s * 0.5, FRONT - P + 0.05, BASE - 0.15), bevel=0.02)
y = FRONT - 0.01
while y > FRONT - P:
    box("Plank", (1.1, 0.062, 0.03), (0, y - 0.031, BASE - 0.015), grain=0, bevel=0.004)
    y -= 0.07
for s in (-1, 1):
    log("Wood", PTOP - BASE, 0.04, Vector((s * 0.5, PY, (BASE + PTOP) / 2)), "z")
    log("Wood", P - 0.06, 0.022, Vector((s * 0.5, (FRONT + PY) / 2, BASE + 0.3)), "y", segs=6)
    log("Wood", 0.3, 0.022, Vector((s * 0.35, PY, BASE + 0.3)), "x", segs=6)
    for bx in (0.25, 0.42):
        log("Wood", 0.3, 0.014, Vector((s * bx, PY, BASE + 0.15)), "z", segs=6)
    log("Wood", 0.3, 0.014, Vector((s * 0.5, (FRONT + PY) / 2, BASE + 0.15)), "z", segs=6)
log("Wood", 1.2, 0.042, Vector((0, PY, PTOP)), "x")
for dz, dy in ((0.045, 0.1), (0.1, 0.22)):
    box("Plank", (0.4, 0.13, 0.05), (0, FRONT - P - dy + 0.05, BASE - dz - 0.02), grain=0, bevel=0.008)
    box("Stone", (0.42, 0.1, 0.08), (0, FRONT - P - dy + 0.05, BASE - dz - 0.08), bevel=0.015)

pe = Vector((0, PY - 0.14, PTOP + 0.02))
pr = Vector((0, FRONT + 0.02, TOPW - 0.12))
pup = (pr - pe).normalized()
pn = Vector((0, -pup.z, pup.y))
plen = (pr - pe).length
box("DarkWood", (1.3, plen, 0.035), pe + pup * (plen / 2), grain=0, rot=basis(pup, pn))
shingles(pe, pup, pn, plen, 0.65, 3, 0.03)

LX = 0.42
box("Iron", (0.02, 0.06, 0.02), (LX, PY - 0.045, PTOP - 0.12))
box("Iron", (0.075, 0.075, 0.015), (LX, PY - 0.075, PTOP - 0.155))
box("Window", (0.055, 0.055, 0.075), (LX, PY - 0.075, PTOP - 0.2))
box("Iron", (0.075, 0.075, 0.015), (LX, PY - 0.075, PTOP - 0.245))

box("Plank", (0.38, 0.11, 0.025), (-0.43, FRONT - 0.08, BASE + 0.17), grain=0, bevel=0.006)
for s in (-1, 1):
    box("DarkWood", (0.03, 0.1, 0.16), (-0.43 + s * 0.15, FRONT - 0.08, BASE + 0.08), grain=2, bevel=0.004)

# --- Firewood stacked against the right wall, under its window ---------------------------------------------------
FX = W / 2 + R + 0.1
for s in (-1, 1):
    box("DarkWood", (0.2, 0.04, 0.04), (FX, s * 0.25, BASE + 0.02), grain=0)
for row in range(4):
    for k in range(9):
        yy = -0.3 + k * 0.068 + (0.034 if row % 2 else 0)
        if abs(yy) < 0.33:
            at = Vector((FX + rnd.uniform(-0.015, 0.015), yy, BASE + 0.07 + row * 0.058))
            log("Wood", 0.18 + rnd.uniform(-0.02, 0.02), 0.03 + rnd.uniform(-0.004, 0.004), at, "x", segs=6)

# --- Mesh, materials, export ------------------------------------------------------------------------------------
mesh = bpy.data.meshes.new("Lodge")
bm.to_mesh(mesh)
for name, (hex_, texture) in MATERIALS.items():
    m = bpy.data.materials.new(name)
    rgb = [int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    # sRGB hex → linear, which is what the glTF base colour factor holds.
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*lin, 1)
    bsdf.inputs["Roughness"].default_value = 0.9
    m.diffuse_color = (*lin, 1)
    if texture:
        m["texture"] = texture
    mesh.materials.append(m)
obj = bpy.data.objects.new("Lodge", mesh)
bpy.context.scene.collection.objects.link(obj)

print("triangles", sum(len(p.vertices) - 2 for p in mesh.polygons))
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True, export_extras=True)
