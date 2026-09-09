(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/app/data:831935 [app-client] (ecmascript) <text/javascript>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ulangiRingkasan",
    ()=>$$RSC_SERVER_ACTION_4
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js [app-client] (ecmascript)");
/* __next_internal_action_entry_do_not_use__ [{"60bfefddb69a7bb4ab115243b528f7d0a2e1d21e3e":{"name":"ulangiRingkasan"}},"app/actions.ts",""] */ "use turbopack no side effects";
;
const $$RSC_SERVER_ACTION_4 = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createServerReference"])("60bfefddb69a7bb4ab115243b528f7d0a2e1d21e3e", __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["callServer"], void 0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$client$2d$wrapper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["findSourceMapURL"], "ulangiRingkasan");
;
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/RingkasanAi.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "RingkasanAi",
    ()=>RingkasanAi
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$data$3a$831935__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__ = __turbopack_context__.i("[project]/app/data:831935 [app-client] (ecmascript) <text/javascript>");
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
/**
 * Merender paragraf beserta `kode` inline-nya.
 *
 * Bukan parser markdown, dan sengaja: keluaran model di sini adalah prosa
 * dengan sesekali nama file atau path di dalam backtick. Menarik parser
 * markdown penuh berarti satu dependensi baru — plus permukaan sanitasi HTML —
 * untuk dua hal yang selesai dalam sepuluh baris.
 *
 * Aman dari injeksi karena yang dibangun elemen React, bukan innerHTML: teks
 * apa pun dari model berakhir sebagai teks, bukan markup.
 */ function Prosa({ teks }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: teks.split(/\n\s*\n/).map((p)=>p.trim()).filter((p)=>p !== '').map((p, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "ringkas-p",
                children: p.split('`').map((bagian, j)=>// Indeks ganjil berada di antara sepasang backtick. Backtick yang
                    // tidak berpasangan otomatis jadi teks biasa, bukan kode yang
                    // menelan sisa paragraf.
                    j % 2 === 1 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                        children: bagian
                    }, j, false, {
                        fileName: "[project]/components/RingkasanAi.tsx",
                        lineNumber: 34,
                        columnNumber: 29
                    }, this) : bagian)
            }, i, false, {
                fileName: "[project]/components/RingkasanAi.tsx",
                lineNumber: 29,
                columnNumber: 11
            }, this))
    }, void 0, false, {
        fileName: "[project]/components/RingkasanAi.tsx",
        lineNumber: 23,
        columnNumber: 5
    }, this);
}
_c = Prosa;
function RingkasanAi({ isi, status, siteId, path, locale }) {
    _s();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$i18n$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["penerjemah"])(locale);
    const [galat, setGalat] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [menunggu, mulai] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTransition"])();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    // Tidak pernah dicoba dan tidak ada apa pun untuk ditampilkan: panel yang
    // menjelaskan ketiadaan dirinya sendiri cuma memakan ruang.
    if (isi === null && (status === null || status.status === 'not_needed')) return null;
    const gagal = status?.status === 'failed';
    const dilewati = status?.status === 'skipped';
    function ulangi() {
        mulai(async ()=>{
            const hasil = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$data$3a$831935__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$text$2f$javascript$3e$__["ulangiRingkasan"])(siteId, path);
            setGalat(hasil?.error ?? null);
            if (!hasil?.error) router.refresh();
        });
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "ringkas",
        "aria-label": t('ai.judul'),
        children: [
            gagal && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "ringkas-gagal",
                role: "alert",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Ikon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Ikon"], {
                        nama: "alert",
                        ukuran: 14
                    }, void 0, false, {
                        fileName: "[project]/components/RingkasanAi.tsx",
                        lineNumber: 95,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: [
                            "Percobaan terakhir gagal",
                            status?.model ? ` (${status.model})` : '',
                            ":",
                            ' ',
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "ringkas-mentah",
                                children: status?.galat ?? 'tanpa pesan'
                            }, void 0, false, {
                                fileName: "[project]/components/RingkasanAi.tsx",
                                lineNumber: 97,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/RingkasanAi.tsx",
                        lineNumber: 96,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/RingkasanAi.tsx",
                lineNumber: 94,
                columnNumber: 9
            }, this),
            dilewati && isi === null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "ringkas-lewat",
                children: "Belum ada penyedia AI yang dipilih, jadi pemindaian jalan tanpa ringkasan."
            }, void 0, false, {
                fileName: "[project]/components/RingkasanAi.tsx",
                lineNumber: 103,
                columnNumber: 9
            }, this),
            isi !== null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("details", {
                className: "ringkas-lipat",
                open: true,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("summary", {
                        className: "ringkas-label",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                style: {
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Ikon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Ikon"], {
                                        nama: "sparkle",
                                        ukuran: 14
                                    }, void 0, false, {
                                        fileName: "[project]/components/RingkasanAi.tsx",
                                        lineNumber: 112,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: t('ai.judul')
                                    }, void 0, false, {
                                        fileName: "[project]/components/RingkasanAi.tsx",
                                        lineNumber: 113,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/RingkasanAi.tsx",
                                lineNumber: 111,
                                columnNumber: 13
                            }, this),
                            isi.model !== null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "ringkas-model-pill",
                                children: isi.model
                            }, void 0, false, {
                                fileName: "[project]/components/RingkasanAi.tsx",
                                lineNumber: 115,
                                columnNumber: 36
                            }, this),
                            isi.waktu !== null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                style: {
                                    fontSize: 'var(--t-mikro)',
                                    color: 'var(--ink-2)',
                                    fontWeight: 400,
                                    marginLeft: 'auto',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Ikon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Ikon"], {
                                        nama: "waktu",
                                        ukuran: 12
                                    }, void 0, false, {
                                        fileName: "[project]/components/RingkasanAi.tsx",
                                        lineNumber: 118,
                                        columnNumber: 17
                                    }, this),
                                    isi.waktu
                                ]
                            }, void 0, true, {
                                fileName: "[project]/components/RingkasanAi.tsx",
                                lineNumber: 117,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/RingkasanAi.tsx",
                        lineNumber: 110,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "ringkas-isi",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Prosa, {
                                teks: isi.teks
                            }, void 0, false, {
                                fileName: "[project]/components/RingkasanAi.tsx",
                                lineNumber: 125,
                                columnNumber: 13
                            }, this),
                            gagal && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "ringkas-basi",
                                children: "Ringkasan di atas berasal dari peringkasan terakhir yang berhasil, bukan dari percobaan yang baru gagal."
                            }, void 0, false, {
                                fileName: "[project]/components/RingkasanAi.tsx",
                                lineNumber: 127,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/components/RingkasanAi.tsx",
                        lineNumber: 124,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/RingkasanAi.tsx",
                lineNumber: 109,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "ringkas-aksi",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    className: "ringkas-ulang",
                    type: "button",
                    onClick: ulangi,
                    disabled: menunggu,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$components$2f$Ikon$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Ikon"], {
                            nama: "segarkan",
                            ukuran: 13
                        }, void 0, false, {
                            fileName: "[project]/components/RingkasanAi.tsx",
                            lineNumber: 138,
                            columnNumber: 11
                        }, this),
                        menunggu ? t('ai.mengulang') : isi === null ? t('ai.ringkasSekarang') : t('ai.ulangi')
                    ]
                }, void 0, true, {
                    fileName: "[project]/components/RingkasanAi.tsx",
                    lineNumber: 137,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/components/RingkasanAi.tsx",
                lineNumber: 136,
                columnNumber: 7
            }, this),
            galat && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "ringkas-gagal",
                role: "alert",
                children: galat
            }, void 0, false, {
                fileName: "[project]/components/RingkasanAi.tsx",
                lineNumber: 144,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/RingkasanAi.tsx",
        lineNumber: 87,
        columnNumber: 5
    }, this);
}
_s(RingkasanAi, "E0vIb7NXpBCw4gYVBMgzks4xkXA=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useTransition"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"]
    ];
});
_c1 = RingkasanAi;
var _c, _c1;
__turbopack_context__.k.register(_c, "Prosa");
__turbopack_context__.k.register(_c1, "RingkasanAi");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/Tab.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Tab",
    ()=>Tab
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$i18n$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/i18n/index.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
/**
 * Segmen URL dipisah dari labelnya. Rutenya sudah dipakai dan bisa
 * di-bookmark (`/sites/3/bugs`), jadi yang berubah cuma yang dibaca mata.
 *
 * Tunggal, bukan jamak: tabnya berpasangan dengan tombol `Scan Bug`, dan
 * DESIGN.md mensyaratkan nama yang sama sepanjang alur.
 */ const TAB = [
    [
        'bugs',
        'Bug'
    ],
    [
        'console',
        'Console'
    ],
    [
        'security',
        'Security'
    ],
    [
        'seo',
        'SEO'
    ],
    // GEO dan Audit datang dari claude-seo, bukan dari aturan. Diletakkan
    // BERSEBELAHAN dan setelah SEO, bukan diselipkan di antara yang
    // deterministik: keduanya punya sifat berbeda (§lib/kategori.ts), dan
    // mengelompokkannya membuat batas itu terlihat tanpa perlu label tambahan.
    [
        'geo',
        'GEO'
    ],
    [
        'audit',
        'Audit'
    ],
    [
        'lighthouse',
        'Lighthouse'
    ]
];
function Tab({ siteId, locale }) {
    _s();
    const path = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const t = (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$i18n$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["penerjemah"])(locale);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
        className: "tab",
        "aria-label": t('tab.kategori'),
        children: TAB.map(([t, label])=>{
            const href = `/sites/${siteId}/${t}`;
            const aktif = path === href;
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                href: href,
                className: "tab-item",
                "aria-current": aktif ? 'page' : undefined,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: label
                    }, void 0, false, {
                        fileName: "[project]/components/Tab.tsx",
                        lineNumber: 43,
                        columnNumber: 13
                    }, this),
                    (t === 'geo' || t === 'audit') && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "tab-ai-tag",
                        children: "AI"
                    }, void 0, false, {
                        fileName: "[project]/components/Tab.tsx",
                        lineNumber: 44,
                        columnNumber: 48
                    }, this)
                ]
            }, t, true, {
                fileName: "[project]/components/Tab.tsx",
                lineNumber: 37,
                columnNumber: 11
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/components/Tab.tsx",
        lineNumber: 32,
        columnNumber: 5
    }, this);
}
_s(Tab, "kx72sda92+XlSh1QiZvq/YVQxpY=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
_c = Tab;
var _c;
__turbopack_context__.k.register(_c, "Tab");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_1r0w3mh._.js.map