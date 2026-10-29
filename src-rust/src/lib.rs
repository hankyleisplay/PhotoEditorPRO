use std::slice;
use std::mem;

// WebAssembly memory allocation helpers
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, size);
    }
}

// Convert RGB (0..255) to HSL (H: 0..360, S: 0..1, L: 0..1)
fn rgb_to_hsl(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let r = r / 255.0;
    let g = g / 255.0;
    let b = b / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let mut h = 0.0;
    let mut s = 0.0;
    let l = (max + min) / 2.0;

    if max != min {
        let d = max - min;
        s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
        if max == r {
            h = (g - b) / d + (if g < b { 6.0 } else { 0.0 });
        } else if max == g {
            h = (b - r) / d + 2.0;
        } else if max == b {
            h = (r - g) / d + 4.0;
        }
        h *= 60.0;
    }
    (h, s, l)
}

fn hue_to_rgb(p: f32, q: f32, mut t: f32) -> f32 {
    if t < 0.0 { t += 1.0; }
    if t > 1.0 { t -= 1.0; }
    if t < 1.0 / 6.0 { return p + (q - p) * 6.0 * t; }
    if t < 0.5 { return q; }
    if t < 2.0 / 3.0 { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
    p
}

// Convert HSL back to RGB (0..255)
fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (f32, f32, f32) {
    let mut r = l;
    let mut g = l;
    let mut b = l;
    let h = h / 360.0;

    if s != 0.0 {
        let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
        let p = 2.0 * l - q;
        r = hue_to_rgb(p, q, h + 1.0 / 3.0);
        g = hue_to_rgb(p, q, h);
        b = hue_to_rgb(p, q, h - 1.0 / 3.0);
    }
    (r * 255.0, g * 255.0, b * 255.0)
}

// Per-pixel hash noise in [-0.5, 0.5). Must stay in sync with grainNoise() in app.js.
fn grain_noise(px: u32) -> f32 {
    let mut h = px.wrapping_mul(0x9E37_79B1);
    h ^= h >> 15;
    h = h.wrapping_mul(0x85EB_CA77);
    h ^= h >> 13;
    h = h.wrapping_mul(0xC2B2_AE3D);
    h ^= h >> 16;
    ((h >> 8) as f32) / 16_777_216.0 - 0.5
}

struct HslWeights {
    red: f32,
    orange: f32,
    yellow: f32,
    green: f32,
    aqua: f32,
    blue: f32,
    purple: f32,
    magenta: f32,
}

fn get_hsl_weights(h: f32) -> HslWeights {
    let mut w = HslWeights {
        red: 0.0, orange: 0.0, yellow: 0.0, green: 0.0,
        aqua: 0.0, blue: 0.0, purple: 0.0, magenta: 0.0,
    };
    if h >= 0.0 && h < 30.0 {
        let r = (h - 0.0) / 30.0;
        w.orange = r; w.red = 1.0 - r;
    } else if h >= 30.0 && h < 60.0 {
        let r = (h - 30.0) / 30.0;
        w.yellow = r; w.orange = 1.0 - r;
    } else if h >= 60.0 && h < 120.0 {
        let r = (h - 60.0) / 60.0;
        w.green = r; w.yellow = 1.0 - r;
    } else if h >= 120.0 && h < 180.0 {
        let r = (h - 120.0) / 60.0;
        w.aqua = r; w.green = 1.0 - r;
    } else if h >= 180.0 && h < 240.0 {
        let r = (h - 180.0) / 60.0;
        w.blue = r; w.aqua = 1.0 - r;
    } else if h >= 240.0 && h < 270.0 {
        let r = (h - 240.0) / 30.0;
        w.purple = r; w.blue = 1.0 - r;
    } else if h >= 270.0 && h < 300.0 {
        let r = (h - 270.0) / 30.0;
        w.magenta = r; w.purple = 1.0 - r;
    } else {
        let r = (h - 300.0) / 60.0;
        w.red = r; w.magenta = 1.0 - r;
    }
    w
}

// Master Pixel Processing Engine
#[no_mangle]
pub unsafe extern "C" fn process_pixels(
    src_ptr: *const u8,
    dst_ptr: *mut u8,
    len: usize,
    width: u32,
    height: u32,
    
    // Basic Adjustments
    exposure: f32,
    contrast: f32,
    temp_red: f32,
    temp_green: f32,
    temp_blue: f32,
    tint_red: f32,
    tint_green: f32,
    tint_blue: f32,
    sat_factor: f32,
    
    // Advanced Tone controls
    h_factor: f32,
    s_factor: f32,
    w_factor: f32,
    b_factor: f32,
    
    // Presence
    vib_factor: f32,
    clarity_factor: f32,
    dh_factor: f32,
    
    // Detail & Effects
    sharp_factor: f32,
    nr_factor: f32,
    vig_factor: f32,
    grain_factor: f32,
    
    // Split Toning
    hr: f32, hg: f32, hb: f32,
    sr: f32, sg: f32, sb: f32,
    has_split_toning: i32,
    balance_factor: f32,
    
    // Curves (LUTs: combined size 1024)
    has_curves: i32,
    curves_lut_ptr: *const u8,
    
    // HSL
    has_hsl: i32,
    hsl_adjustments_ptr: *const f32,
    
    // Blurred data (for sharpening/nr)
    blurred_ptr: *const u8,
) {
    if width == 0 || height == 0 || len % 4 != 0 {
        return;
    }
    let src = slice::from_raw_parts(src_ptr, len);
    let dst = slice::from_raw_parts_mut(dst_ptr, len);
    
    let cx = width as f32 / 2.0;
    let cy = height as f32 / 2.0;
    let max_dist_sq = cx * cx + cy * cy;
    
    let exp_factor = 2.0f32.powf(exposure / 50.0);
    let contrast_factor = (259.0 * (contrast + 255.0)) / (255.0 * (259.0 - contrast));
    
    for i in (0..len).step_by(4) {
        let idx = i;
        let mut r = src[idx] as f32;
        let mut g = src[idx+1] as f32;
        let mut b = src[idx+2] as f32;
        let a = src[idx+3];
        
        // --- 0. SHARPENING & NOISE REDUCTION ---
        if !blurred_ptr.is_null() {
            let br = *blurred_ptr.add(idx) as f32;
            let bg = *blurred_ptr.add(idx+1) as f32;
            let bb = *blurred_ptr.add(idx+2) as f32;
            
            if sharp_factor > 0.0 {
                r += (r - br) * sharp_factor;
                g += (g - bg) * sharp_factor;
                b += (b - bb) * sharp_factor;
            }
            if nr_factor > 0.0 {
                r += (br - r) * nr_factor;
                g += (bg - g) * nr_factor;
                b += (bb - b) * nr_factor;
            }
        }
        
        // --- 1. EXPOSURE ---
        r *= exp_factor;
        g *= exp_factor;
        b *= exp_factor;
        
        // --- 2. TEMPERATURE & TINT ---
        r += temp_red + tint_red;
        g += temp_green + tint_green;
        b += temp_blue + tint_blue;
        
        // --- 3. LUMINANCE & TONE CONTROLS (Highlights, Shadows, Whites, Blacks) ---
        let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let mut y_norm = y / 255.0;
        if y_norm > 1.0 { y_norm = 1.0; } else if y_norm < 0.0 { y_norm = 0.0; }
        
        let m_shadow = (1.0 - y_norm) * (1.0 - y_norm);
        let m_highlight = y_norm * y_norm;
        
        let tone_shift = (s_factor * m_shadow) + (h_factor * m_highlight) + (w_factor * y_norm) + (b_factor * (1.0 - y_norm));
        r += tone_shift;
        g += tone_shift;
        b += tone_shift;
        
        // --- 4. CLARITY ---
        if clarity_factor != 0.0 {
            let s_curve = |v: f32| -> f32 {
                let vn = (v / 255.0).clamp(0.0, 1.0);
                (3.0 * vn * vn - 2.0 * vn * vn * vn) * 255.0
            };
            if clarity_factor > 0.0 {
                r += (s_curve(r) - r) * clarity_factor;
                g += (s_curve(g) - g) * clarity_factor;
                b += (s_curve(b) - b) * clarity_factor;
            } else {
                r += (r - s_curve(r)) * clarity_factor;
                g += (g - s_curve(g)) * clarity_factor;
                b += (b - s_curve(b)) * clarity_factor;
            }
        }
        
        // --- 5. DEHAZE ---
        if dh_factor != 0.0 {
            let y_l = ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0).clamp(0.0, 1.0);
            let black_pull = -25.0 * dh_factor * (1.0 - y_l);
            r += black_pull; g += black_pull; b += black_pull;
            
            let dh_contrast = 1.0 + dh_factor * 0.25;
            r = dh_contrast * (r - 128.0) + 128.0;
            g = dh_contrast * (g - 128.0) + 128.0;
            b = dh_contrast * (b - 128.0) + 128.0;
        }
        
        // --- 6. CONTRAST ---
        r = contrast_factor * (r - 128.0) + 128.0;
        g = contrast_factor * (g - 128.0) + 128.0;
        b = contrast_factor * (b - 128.0) + 128.0;
        
        // --- 7. VIBRANCE ---
        if vib_factor != 0.0 {
            let rn = r.clamp(0.0, 255.0);
            let gn = g.clamp(0.0, 255.0);
            let bn = b.clamp(0.0, 255.0);
            let max = rn.max(gn).max(bn) / 255.0;
            let min = rn.min(gn).min(bn) / 255.0;
            let sat = (max - min) / (max + 1e-5);
            let v_factor = vib_factor * (1.0 - sat) * 1.5;
            
            let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r += (r - lum) * v_factor;
            g += (g - lum) * v_factor;
            b += (b - lum) * v_factor;
        }
        
        // --- 8. SATURATION ---
        let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = luminance + (r - luminance) * sat_factor;
        g = luminance + (g - luminance) * sat_factor;
        b = luminance + (b - luminance) * sat_factor;
        
        // --- 9. HSL COLOR MIXER ---
        if has_hsl != 0 {
            let rc = r.clamp(0.0, 255.0);
            let gc = g.clamp(0.0, 255.0);
            let bc = b.clamp(0.0, 255.0);
            
            let (mut h, mut s, mut l) = rgb_to_hsl(rc, gc, bc);
            let w = get_hsl_weights(h);
            
            let hsl_h = slice::from_raw_parts(hsl_adjustments_ptr, 8);
            let hsl_s = slice::from_raw_parts(hsl_adjustments_ptr.add(8), 8);
            let hsl_l = slice::from_raw_parts(hsl_adjustments_ptr.add(16), 8);
            
            let d_h = (w.red * hsl_h[0] + w.orange * hsl_h[1] + w.yellow * hsl_h[2] +
                       w.green * hsl_h[3] + w.aqua * hsl_h[4] + w.blue * hsl_h[5] +
                       w.purple * hsl_h[6] + w.magenta * hsl_h[7]) * 0.3;
                       
            let d_s = (w.red * hsl_s[0] + w.orange * hsl_s[1] + w.yellow * hsl_s[2] +
                       w.green * hsl_s[3] + w.aqua * hsl_s[4] + w.blue * hsl_s[5] +
                       w.purple * hsl_s[6] + w.magenta * hsl_s[7]) * 0.01;
                       
            let d_l = (w.red * hsl_l[0] + w.orange * hsl_l[1] + w.yellow * hsl_l[2] +
                       w.green * hsl_l[3] + w.aqua * hsl_l[4] + w.blue * hsl_l[5] +
                       w.purple * hsl_l[6] + w.magenta * hsl_l[7]) * 0.01;
            
            h = (h + d_h + 360.0) % 360.0;
            
            if d_s < 0.0 { s = s * (1.0 + d_s); }
            else { s = s + (1.0 - s) * d_s; }
            
            if d_l < 0.0 { l = l * (1.0 + d_l); }
            else { l = l + (1.0 - l) * d_l; }
            
            let (ro, go, bo) = hsl_to_rgb(h, s, l);
            r = ro; g = go; b = bo;
        }
        
        // --- 10. TONE CURVES ---
        if has_curves != 0 {
            let rc = r.clamp(0.0, 255.0) as usize;
            let gc = g.clamp(0.0, 255.0) as usize;
            let bc = b.clamp(0.0, 255.0) as usize;
            
            let lut_r = *curves_lut_ptr.add(256 + rc) as f32;
            let lut_g = *curves_lut_ptr.add(512 + gc) as f32;
            let lut_b = *curves_lut_ptr.add(768 + bc) as f32;
            
            r = *curves_lut_ptr.add(lut_r.clamp(0.0, 255.0) as usize) as f32;
            g = *curves_lut_ptr.add(lut_g.clamp(0.0, 255.0) as usize) as f32;
            b = *curves_lut_ptr.add(lut_b.clamp(0.0, 255.0) as usize) as f32;
        }
        
        // --- 10.5. SPLIT TONING ---
        if has_split_toning != 0 {
            let y_l = ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0).clamp(0.0, 1.0);
            let w_high = ((y_l - 0.5 - balance_factor * 0.4) * 2.0 + 0.5).clamp(0.0, 1.0);
            let w_shadow = 1.0 - w_high;
            r += hr * w_high + sr * w_shadow;
            g += hg * w_high + sg * w_shadow;
            b += hb * w_high + sb * w_shadow;
        }
        
        // --- 11. VIGNETTE ---
        if vig_factor != 0.0 {
            let px_idx = i / 4;
            let px_x = (px_idx % (width as usize)) as f32;
            let px_y = (px_idx / (width as usize)) as f32;
            
            let dx = px_x - cx;
            let dy = px_y - cy;
            let dist_sq = dx * dx + dy * dy;
            let r_norm = dist_sq / max_dist_sq;
            
            let blend = r_norm * (2.0 - r_norm);
            if vig_factor < 0.0 {
                let v_amt = 1.0 + vig_factor * blend;
                r *= v_amt; g *= v_amt; b *= v_amt;
            } else {
                let v_amt = vig_factor * blend;
                r = r + (255.0 - r) * v_amt;
                g = g + (255.0 - g) * v_amt;
                b = b + (255.0 - b) * v_amt;
            }
        }
        
        // --- 12. FILM GRAIN ---
        if grain_factor > 0.0 {
            let noise = grain_noise((i / 4) as u32) * grain_factor * 0.12 * 255.0;
            r += noise; g += noise; b += noise;
        }
        
        // --- 13. CLAMPING & WRITING ---
        dst[idx]   = r.clamp(0.0, 255.0) as u8;
        dst[idx+1] = g.clamp(0.0, 255.0) as u8;
        dst[idx+2] = b.clamp(0.0, 255.0) as u8;
        dst[idx+3] = a;
    }
}
