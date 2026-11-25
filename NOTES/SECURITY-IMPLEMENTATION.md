# NEXUS Calculator - Security Implementation Plan

## Overview

This document outlines security improvements implemented for the NEXUS Scientific Calculator based on the comprehensive security audit.

**Key Finding:** This is a client-side only application with no backend. Many traditional security measures don't apply, but we can implement browser-level protections.

---

## Priority 1: Immediate Fixes

### 1. Content Security Policy (CSP)

**Implementation:** Add CSP meta tag to index.html

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data:;
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
">
```

**Rationale:**
- `default-src 'self'`: Only load resources from same origin
- `script-src 'self' 'unsafe-inline'`: Allow inline scripts (required for current implementation)
- `style-src`: Allow Google Fonts
- `frame-ancestors 'none'`: Prevent clickjacking
- `form-action 'self'`: Prevent form hijacking

**Future Improvement:** Remove 'unsafe-inline' by moving inline scripts to external files.

### 2. Fix XSS Vulnerabilities via innerHTML

**Problem:** Multiple uses of innerHTML with user-influenced content in pro.js and potentially script.js.

**Solution:** Replace innerHTML with safer alternatives or ensure all content is properly escaped.

**Changes Required:**
- Audit all innerHTML usages
- Replace with textContent where possible
- Use esc() function for all user-influenced content
- Create safe HTML builder function

### 3. Add Calculation Limits

**Problem:** No limits on expression complexity, allowing DoS via browser freeze.

**Solution:** Add execution guards and limits.

**Implementation:**
```javascript
// Add to script.js
const CALC_LIMITS = {
  MAX_EXPRESSION_LENGTH: 500,
  MAX_FACTORIAL: 170,          // Max factorial that JS can handle
  MAX_RECURSION_DEPTH: 100,
  MAX_CALCULATION_TIME: 5000,   // 5 seconds
  MAX_NUMBER: 1e308,            // Max safe number
  MIN_NUMBER: -1e308
};

function validateCalculationInput(expr) {
  if (expr.length > CALC_LIMITS.MAX_EXPRESSION_LENGTH) {
    throw new Error('Expression too long');
  }
  // Additional validation...
}

function timeboxCalculation(fn, timeout = CALC_LIMITS.MAX_CALCULATION_TIME) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Calculation timeout'));
    }, timeout);
    
    try {
      const result = fn();
      clearTimeout(timer);
      resolve(result);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}
```

---

## Priority 2: Soon Fixes

### 4. Verify Vercel Security Headers

**Action:** Create vercel.json to enforce security headers

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "geolocation=(), microphone=(), camera=()"
        }
      ]
    }
  ]
}
```

### 5. Add Input Length Limits

**Implementation:**
```javascript
// Add maxlength attributes to all inputs
<input ... maxlength="500" />
<textarea ... maxlength="1000"></textarea>

// JavaScript validation
function validateInput(value, maxLength = 500) {
  if (value.length > maxLength) {
    return value.substring(0, maxLength);
  }
  return value;
}
```

### 6. Improve Error Handling

**Current:** Some errors might expose internal state  
**Fix:** Generic error messages for users, detailed logs for developers

```javascript
function safeError(error, userMessage = 'An error occurred') {
  console.error('[NEXUS Error]', error); // Developer info
  showToast(userMessage); // User-friendly message
  return null;
}
```

---

## Priority 3: Future Considerations

### 7. Backend for Real Pro Features

**Current State:** Pro subscription is localStorage-based demo  
**Future:** If monetization becomes real, implement:

```
Backend Requirements:
- Authentication system (OAuth 2.0 / JWT)
- Payment processing (Stripe/Paystack)
- Subscription management API
- Server-side feature validation
- Rate limiting per user
- Audit logging
```

### 8. Self-Host Fonts

**Current:** Google Fonts CDN  
**Future:** Download and serve fonts locally for privacy

```
Benefits:
- No external requests
- Better privacy (no Google tracking)
- Faster load times (same origin)
- Works offline
```

### 9. Subresource Integrity (SRI)

**Current:** Google Fonts loaded without integrity check  
**Future:** Add SRI hashes

```html
<link 
  href="https://fonts.googleapis.com/css2?family=Inter..." 
  rel="stylesheet"
  integrity="sha384-..."
  crossorigin="anonymous"
/>
```

---

## Security Best Practices Implemented

### ✅ Already Secure

1. **No eval():** Math parser doesn't use eval() or Function()
2. **Input Sanitization:** sanitizeExpression() filters dangerous characters
3. **HTML Escaping:** esc() function used in many places
4. **No Secrets:** No API keys or credentials in codebase
5. **HTTPS:** Deployed on Vercel with HTTPS
6. **No SQL:** No database, no SQL injection risk
7. **No CSRF:** No forms submitting to server

### ⚠️ Acknowledged Limitations

1. **Client-Side Only:** All code visible and modifiable by users
2. **No Server Validation:** Calculations can't be verified server-side
3. **localStorage Bypassable:** Pro features can be activated without payment (by design)
4. **Console Access:** Users can modify behavior via developer tools (can't be prevented)

---

## Testing Checklist

After implementing fixes:

- [ ] Test CSP doesn't break functionality
- [ ] Verify all innerHTML uses are safe
- [ ] Test calculation limits (factorial(171) should error)
- [ ] Verify security headers on deployed site
- [ ] Test XSS with various inputs
- [ ] Check browser console for CSP violations
- [ ] Test on mobile devices
- [ ] Verify Pro features still work
- [ ] Test calculator operations
- [ ] Check all panels function correctly

---

## Deployment Notes

### Files to Modify
1. `index.html` - Add CSP meta tag
2. `script.js` - Add calculation limits, fix innerHTML
3. `pro.js` - Fix innerHTML vulnerabilities
4. `vercel.json` - Add security headers (new file)

### Deployment Steps
1. Apply all changes locally
2. Test thoroughly in development
3. Commit changes with security message
4. Push to GitHub
5. Verify Vercel deployment
6. Test production site
7. Monitor for CSP violations
8. Update documentation

---

## Monitoring

**After Deployment:**
- Check browser console for CSP violations
- Monitor for unusual error patterns
- Watch for performance issues from limits
- Gather user feedback on any broken functionality

**Security Headers Verification:**
```bash
curl -I https://your-domain.vercel.app
# Should show:
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Content-Security-Policy: ...
```

---

## Documentation Updates Needed

1. README - Add security section
2. CONTRIBUTING - Security reporting process
3. User Guide - Explain Pro feature limitations
4. Developer Docs - Security considerations

---

## Conclusion

This implementation provides **reasonable security for a client-side calculator application** while acknowledging its inherent limitations.

**What We CAN Protect:**
- XSS attacks
- Clickjacking
- Resource injection
- Browser freezing via DoS

**What We CANNOT Protect:**
- Client-side code modification
- localStorage tampering
- Pro feature bypass
- Calculation manipulation

For a production SaaS with real payments, a backend is essential.

---

**Implementation Date:** 2025-01-25  
**Next Review:** When backend features are considered
