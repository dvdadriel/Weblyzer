(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/app/data:34597f [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "simpanPengaturan",
    ()=>$$RSC_SERVER_ACTION_7
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js [app-client] (ecmascript)");
/* __next_internal_action_entry_do_not_use__ [{"705ad00a7f563d6173345090a8ed64cd0f95203a16":{"name":"simpanPengaturan"}},"app/actions.ts",""] */ "use turbopack no side effects";
;
const $$RSC_SERVER_ACTION_7 = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createServerReference"])("705ad00a7f563d6173345090a8ed64cd0f95203a16", __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["callServer"], void 0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findSourceMapURL"], "simpanPengaturan");
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/PengaturanSitus.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PengaturanSitus",
    ()=>PengaturanSitus
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$data$3a$34597f__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__ = __turbopack_context__.i("[project]/app/data:34597f [app-client] (ecmascript) <text/javascript>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$pengaturan$2d$situs$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/pengaturan-situs.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Ikon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/components/Ikon.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$i18n$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/i18n/index.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function PengaturanSitus({ siteId, awal, sedangDipindai, locale }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$i18n$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["penerjemah"])(locale);
    const [hasil, kirim, menunggu] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useActionState"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$data$3a$34597f__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__["simpanPengaturan"].bind(null, siteId), null);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
        action: kirim,
        className: "atur",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("fieldset", {
                className: "atur-set",
                disabled: menunggu || sedangDipindai,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("legend", {
                        className: "model-legend",
                        children: t('atur.judul')
                    }, void 0, false, {
                        fileName: "[project]/components/PengaturanSitus.tsx",
                        lineNumber: 38,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        className: "atur-baris",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "atur-label",
                                children: t('atur.maxPages')
                            }, void 0, false, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 41,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                className: "atur-input",
                                type: "number",
                                name: "maxPages",
                                min: 1,
                                max: 2000,
                                defaultValue: awal.max_pages,
                                required: true
                            }, void 0, false, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 42,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "atur-catatan",
                                children: [
                                    "kira-kira ",
                                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$pengaturan$2d$situs$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["perkiraanMenit"])(awal.max_pages),
                                    " menit crawl, sebelum Lighthouse"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 54,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/PengaturanSitus.tsx",
                        lineNumber: 40,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        className: "atur-baris",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "atur-label",
                                children: t('atur.mode')
                            }, void 0, false, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 60,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                className: "atur-input",
                                name: "mode",
                                defaultValue: awal.lighthouse_mode,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "sample",
                                        children: "sample — satu halaman per pola URL"
                                    }, void 0, false, {
                                        fileName: "[project]/components/PengaturanSitus.tsx",
                                        lineNumber: 62,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "full",
                                        children: "full — setiap halaman"
                                    }, void 0, false, {
                                        fileName: "[project]/components/PengaturanSitus.tsx",
                                        lineNumber: 63,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 61,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "atur-catatan",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                                        className: "akun-perintah",
                                        children: "full"
                                    }, void 0, false, {
                                        fileName: "[project]/components/PengaturanSitus.tsx",
                                        lineNumber: 66,
                                        columnNumber: 13
                                    }, this),
                                    " mengukur tiap halaman dua kali per strategi; pada situs 141 halaman itu berjam-jam, bukan bermenit-menit"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 65,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/PengaturanSitus.tsx",
                        lineNumber: 59,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        className: "atur-baris",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "atur-label",
                                children: t('atur.sitemap')
                            }, void 0, false, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 72,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                className: "atur-input",
                                type: "url",
                                name: "sitemap",
                                placeholder: "https://situs.com/sitemap.xml",
                                defaultValue: awal.sitemap_url ?? ''
                            }, void 0, false, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 73,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "atur-catatan",
                                children: [
                                    "tersimpan tapi ",
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                        children: "belum dipakai"
                                    }, void 0, false, {
                                        fileName: "[project]/components/PengaturanSitus.tsx",
                                        lineNumber: 85,
                                        columnNumber: 28
                                    }, this),
                                    " — aturan cakupan sitemap belum ada"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 84,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/PengaturanSitus.tsx",
                        lineNumber: 71,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        className: "atur-baris atur-centang",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "checkbox",
                                name: "enabled",
                                defaultChecked: awal.enabled === 1
                            }, void 0, false, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 91,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "atur-label",
                                        children: t('atur.ikutJadwal')
                                    }, void 0, false, {
                                        fileName: "[project]/components/PengaturanSitus.tsx",
                                        lineNumber: 93,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "atur-catatan",
                                        children: [
                                            "dimatikan berarti dilewati",
                                            ' ',
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                                                className: "akun-perintah",
                                                children: "scan -- jadwal"
                                            }, void 0, false, {
                                                fileName: "[project]/components/PengaturanSitus.tsx",
                                                lineNumber: 96,
                                                columnNumber: 15
                                            }, this),
                                            "; riwayat dan temuannya tetap utuh, dan tombol pindai manual tetap jalan"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/components/PengaturanSitus.tsx",
                                        lineNumber: 94,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 92,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/PengaturanSitus.tsx",
                        lineNumber: 90,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        className: "tombol",
                        type: "submit",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Ikon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Ikon"], {
                                nama: "ceklis",
                                ukuran: 15
                            }, void 0, false, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 103,
                                columnNumber: 11
                            }, this),
                            menunggu ? t('atur.menyimpan') : t('atur.simpan')
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/PengaturanSitus.tsx",
                        lineNumber: 102,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/PengaturanSitus.tsx",
                lineNumber: 37,
                columnNumber: 7
            }, this),
            sedangDipindai && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "atur-galat",
                role: "status",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Ikon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Ikon"], {
                        nama: "waktu",
                        ukuran: 13
                    }, void 0, false, {
                        fileName: "[project]/components/PengaturanSitus.tsx",
                        lineNumber: 110,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            "Situs ini sedang dipindai. Pengaturan dikunci sampai selesai —",
                            ' ',
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                children: "batas halaman"
                            }, void 0, false, {
                                fileName: "[project]/components/PengaturanSitus.tsx",
                                lineNumber: 113,
                                columnNumber: 13
                            }, this),
                            " dibaca saat crawl dimulai, jadi mengubahnya di tengah jalan menghasilkan pemindaian yang setengah memakai nilai lama."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/PengaturanSitus.tsx",
                        lineNumber: 111,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/PengaturanSitus.tsx",
                lineNumber: 109,
                columnNumber: 9
            }, this),
            hasil?.error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "atur-galat",
                role: "alert",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Ikon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Ikon"], {
                        nama: "alert",
                        ukuran: 13
                    }, void 0, false, {
                        fileName: "[project]/components/PengaturanSitus.tsx",
                        lineNumber: 121,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: hasil.error
                    }, void 0, false, {
                        fileName: "[project]/components/PengaturanSitus.tsx",
                        lineNumber: 122,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/PengaturanSitus.tsx",
                lineNumber: 120,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/PengaturanSitus.tsx",
        lineNumber: 36,
        columnNumber: 5
    }, this);
}
_s(PengaturanSitus, "ss+QHYCKfOIz8JhXtd/cHOW6QLI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useActionState"]
    ];
});
_c = PengaturanSitus;
var _c;
__turbopack_context__.k.register(_c, "PengaturanSitus");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/lib/pengaturan-situs.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "perkiraanMenit",
    ()=>perkiraanMenit,
    "validasi",
    ()=>validasi
]);
/**
 * Batas atas `max_pages`.
 *
 * Bukan angka bulat yang enak dilihat: crawl Springair 141 halaman butuh ~3
 * menit, jadi 2000 halaman adalah sekitar 42 menit ditambah Lighthouse di
 * atasnya. Di atas itu pemindaian tidak lagi selesai dalam satu malam, dan
 * batas yang menahannya lebih baik daripada menemukannya pukul enam pagi.
 */ const MAX_PAGES_ATAS = 2000;
const MODE = [
    'sample',
    'full'
];
function validasi(m) {
    const angka = m.maxPages.trim();
    // Sengaja bukan `Number()`: `Number('12abc')` adalah NaN yang tertangkap,
    // tapi `Number('')` adalah 0 dan `Number(' 12 ')` adalah 12 — yang pertama
    // akan menyimpan situs yang tidak pernah dijelajahi tanpa mengeluh.
    if (!/^\d+$/.test(angka)) {
        return {
            ok: false,
            galat: 'Jumlah halaman harus berupa angka bulat.'
        };
    }
    const maxPages = Number(angka);
    if (maxPages < 1) {
        // Nol halaman bukan "pindai sesukanya" — ia menghasilkan crawl kosong, dan
        // crawl kosong menandai seluruh temuan lama sudah diperbaiki (§2.2).
        return {
            ok: false,
            galat: 'Jumlah halaman minimal 1.'
        };
    }
    if (maxPages > MAX_PAGES_ATAS) {
        return {
            ok: false,
            galat: `Jumlah halaman maksimal ${MAX_PAGES_ATAS}. Di atas itu satu pemindaian tidak selesai dalam satu malam.`
        };
    }
    if (!MODE.includes(m.mode)) {
        return {
            ok: false,
            galat: `Mode Lighthouse tidak dikenal: ${m.mode}.`
        };
    }
    const sitemap = m.sitemap.trim();
    if (sitemap !== '') {
        // Divalidasi walau BELUM DIPAKAI. `sitemap_url` masih menunggu aturan
        // cakupan sitemap yang belum ditulis, tapi menyimpan nilai yang tidak sah
        // sekarang berarti fitur itu lahir dengan data rusak yang sudah tersimpan.
        if (!/^https?:\/\//i.test(sitemap)) {
            return {
                ok: false,
                galat: 'Alamat sitemap harus diawali http:// atau https://'
            };
        }
        try {
            new URL(sitemap);
        } catch  {
            return {
                ok: false,
                galat: `Alamat sitemap tidak sah: ${sitemap}`
            };
        }
    }
    return {
        ok: true,
        nilai: {
            max_pages: maxPages,
            lighthouse_mode: m.mode,
            // Kosong disimpan sebagai NULL, bukan string kosong: kolomnya nullable
            // dan "belum diisi" berbeda dari "diisi kosong".
            sitemap_url: sitemap === '' ? null : sitemap,
            enabled: m.enabled ? 1 : 0
        }
    };
}
function perkiraanMenit(maxPages) {
    return Math.max(1, Math.round(maxPages / 141 * 3));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_1_-2-7v._.js.map