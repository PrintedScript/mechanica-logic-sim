const EXAMPLES = {
    keylight: {
        "format": "mechanica-sim",
        "version": 1,
        "blocks": [
            {
                "uid": 1,
                "type": 14,
                "x": 60,
                "y": 120,
                "props": {
                    "key": "E"
                },
                "inputs": {}
            },
            {
                "uid": 2,
                "type": 31,
                "x": 320,
                "y": 120,
                "props": {},
                "inputs": {
                    "Activate": 1
                }
            },
            {
                "uid": 3,
                "type": 47,
                "x": 580,
                "y": 120,
                "props": {
                    "inputMode": "Brightness",
                    "lightColor": "#ffd34d"
                },
                "inputs": {
                    "Activate": 2
                },
                "wires": {
                    "Activate": {
                        "color": null,
                        "points": [
                            {
                                "x": 552,
                                "y": 189
                            },
                            {
                                "x": 552,
                                "y": 165
                            }
                        ]
                    }
                }
            }
        ]
    },
    blinker: {
        "format": "mechanica-sim",
        "version": 1,
        "blocks": [
            {
                "uid": 1,
                "type": 34,
                "x": 96,
                "y": 144,
                "props": {},
                "inputs": {
                    "Input": 2
                },
                "wires": {
                    "Input": {
                        "color": null,
                        "points": [
                            {
                                "x": 552,
                                "y": 213
                            },
                            {
                                "x": 552,
                                "y": 288
                            },
                            {
                                "x": 72,
                                "y": 288
                            },
                            {
                                "x": 72,
                                "y": 189
                            }
                        ]
                    }
                }
            },
            {
                "uid": 2,
                "type": 45,
                "x": 336,
                "y": 144,
                "props": {
                    "delay": 0.5
                },
                "inputs": {
                    "Activate": 1
                },
                "wires": {
                    "Activate": {
                        "color": null,
                        "points": [
                            {
                                "x": 312,
                                "y": 213
                            },
                            {
                                "x": 312,
                                "y": 189
                            }
                        ]
                    }
                }
            },
            {
                "uid": 3,
                "type": 47,
                "x": 576,
                "y": 144,
                "props": {
                    "inputMode": "Brightness",
                    "lightColor": "#5dff7a"
                },
                "inputs": {
                    "Activate": 2
                },
                "wires": {
                    "Activate": {
                        "color": null,
                        "points": [
                            {
                                "x": 552,
                                "y": 213
                            },
                            {
                                "x": 552,
                                "y": 189
                            }
                        ]
                    }
                }
            }
        ]
    },
    counter: {
        "format": "mechanica-sim",
        "version": 1,
        "blocks": [
            {
                "uid": 1,
                "type": 14,
                "x": 24,
                "y": 72,
                "props": {
                    "key": "E"
                },
                "inputs": {}
            },
            {
                "uid": 2,
                "type": 82,
                "x": 24,
                "y": 192,
                "props": {
                    "value": 1
                },
                "inputs": {}
            },
            {
                "uid": 3,
                "type": 49,
                "x": 528,
                "y": 96,
                "props": {
                    "onlyUpdateWithSet": true
                },
                "inputs": {
                    "Set": 1,
                    "Data": 4
                },
                "wires": {
                    "Set": {
                        "color": "#ffb84d",
                        "points": [
                            {
                                "x": 264,
                                "y": 117
                            },
                            {
                                "x": 264,
                                "y": 48
                            },
                            {
                                "x": 504,
                                "y": 48
                            },
                            {
                                "x": 504,
                                "y": 141
                            }
                        ]
                    }
                }
            },
            {
                "uid": 4,
                "type": 83,
                "x": 288,
                "y": 72,
                "props": {},
                "inputs": {
                    "Input 1": 3,
                    "Input 2": 2
                },
                "wires": {
                    "Input 1": {
                        "color": "#4da3ff",
                        "points": [
                            {
                                "x": 744,
                                "y": 189
                            },
                            {
                                "x": 744,
                                "y": 24
                            },
                            {
                                "x": 240,
                                "y": 24
                            },
                            {
                                "x": 240,
                                "y": 117
                            }
                        ]
                    },
                    "Input 2": {
                        "color": null,
                        "points": [
                            {
                                "x": 264,
                                "y": 237
                            },
                            {
                                "x": 264,
                                "y": 141
                            }
                        ]
                    }
                }
            },
            {
                "uid": 5,
                "type": 89,
                "x": 816,
                "y": 96,
                "props": {
                    "textColor": "#7ecbff",
                    "bgColor": "#101418"
                },
                "inputs": {
                    "Input": 3
                },
                "wires": {
                    "Input": {
                        "color": null,
                        "points": [
                            {
                                "x": 792,
                                "y": 189
                            },
                            {
                                "x": 792,
                                "y": 141
                            }
                        ]
                    }
                }
            }
        ]
    },
    // Echo rangefinder. Wireless delivery is delayed by distance / 400 studs/s
    // (0.25 studs per canvas px), so a signal echoed straight back measures the
    // gap between the transceivers. Press P: the send tick and the echo tick are
    // latched from a 0.1s clock; (echo - send) × 0.1 = round trip seconds, × 200
    // (half the signal speed) = distance in studs. The transceivers sit 1600 px
    // = 400 studs apart -> reads 2 (seconds) and 400 (studs); drag the far one
    // around and ping again. The lamp is lit while a level change is in flight.
    // The clock oscillator advances at most one step per frame, so readings are
    // only accurate at Speed <= 2x.
    rangefinder: {
        "format": "mechanica-sim",
        "version": 1,
        "blocks": [
            {
                "uid": 1,
                "type": 34,
                "x": 48,
                "y": 48,
                "props": {},
                "inputs": {
                    "Input": 2
                },
                "wires": {
                    "Input": {
                        "color": null,
                        "points": [
                            {
                                "x": 504,
                                "y": 117
                            },
                            {
                                "x": 504,
                                "y": 24
                            },
                            {
                                "x": 24,
                                "y": 24
                            },
                            {
                                "x": 24,
                                "y": 93
                            }
                        ]
                    }
                }
            },
            {
                "uid": 2,
                "type": 45,
                "x": 288,
                "y": 48,
                "props": {
                    "delay": 0.05
                },
                "inputs": {
                    "Activate": 1
                },
                "wires": {
                    "Activate": {
                        "color": null,
                        "points": [
                            {
                                "x": 264,
                                "y": 117
                            },
                            {
                                "x": 264,
                                "y": 93
                            }
                        ]
                    }
                }
            },
            {
                "uid": 3,
                "type": 82,
                "x": 48,
                "y": 192,
                "props": {
                    "value": 1
                },
                "inputs": {}
            },
            {
                "uid": 4,
                "type": 83,
                "x": 288,
                "y": 192,
                "props": {},
                "inputs": {
                    "Input 1": 5,
                    "Input 2": 3
                },
                "wires": {
                    "Input 1": {
                        "color": null,
                        "points": [
                            {
                                "x": 744,
                                "y": 141
                            },
                            {
                                "x": 744,
                                "y": 0
                            },
                            {
                                "x": 264,
                                "y": 0
                            },
                            {
                                "x": 264,
                                "y": 237
                            }
                        ]
                    },
                    "Input 2": {
                        "color": null,
                        "points": [
                            {
                                "x": 264,
                                "y": 237
                            },
                            {
                                "x": 264,
                                "y": 261
                            }
                        ]
                    }
                }
            },
            {
                "uid": 5,
                "type": 49,
                "x": 528,
                "y": 48,
                "props": {
                    "onlyUpdateWithSet": true
                },
                "inputs": {
                    "Set": 2,
                    "Data": 4
                },
                "wires": {
                    "Set": {
                        "color": null,
                        "points": [
                            {
                                "x": 504,
                                "y": 117
                            },
                            {
                                "x": 504,
                                "y": 93
                            }
                        ]
                    },
                    "Data": {
                        "color": null,
                        "points": [
                            {
                                "x": 504,
                                "y": 285
                            },
                            {
                                "x": 504,
                                "y": 117
                            }
                        ]
                    }
                }
            },
            {
                "uid": 6,
                "type": 14,
                "x": 48,
                "y": 336,
                "props": {
                    "key": "P"
                },
                "inputs": {}
            },
            {
                "uid": 7,
                "type": 44,
                "x": 288,
                "y": 336,
                "props": {
                    "channel": 7
                },
                "inputs": {
                    "Send Signal": 6
                }
            },
            {
                "uid": 8,
                "type": 49,
                "x": 528,
                "y": 336,
                "props": {
                    "onlyUpdateWithSet": true
                },
                "inputs": {
                    "Set": 6,
                    "Data": 5
                },
                "wires": {
                    "Set": {
                        "color": null,
                        "points": [
                            {
                                "x": 264,
                                "y": 381
                            },
                            {
                                "x": 264,
                                "y": 480
                            },
                            {
                                "x": 504,
                                "y": 480
                            },
                            {
                                "x": 504,
                                "y": 381
                            }
                        ]
                    },
                    "Data": {
                        "color": null,
                        "points": [
                            {
                                "x": 744,
                                "y": 141
                            },
                            {
                                "x": 744,
                                "y": 312
                            },
                            {
                                "x": 504,
                                "y": 312
                            },
                            {
                                "x": 504,
                                "y": 405
                            }
                        ]
                    }
                }
            },
            {
                "uid": 9,
                "type": 49,
                "x": 528,
                "y": 504,
                "props": {
                    "onlyUpdateWithSet": true
                },
                "inputs": {
                    "Set": 7,
                    "Data": 5
                },
                "wires": {
                    "Set": {
                        "color": null,
                        "points": [
                            {
                                "x": 504,
                                "y": 405
                            },
                            {
                                "x": 504,
                                "y": 549
                            }
                        ]
                    },
                    "Data": {
                        "color": null,
                        "points": [
                            {
                                "x": 1224,
                                "y": 141
                            },
                            {
                                "x": 1224,
                                "y": 720
                            },
                            {
                                "x": 504,
                                "y": 720
                            },
                            {
                                "x": 504,
                                "y": 573
                            }
                        ]
                    }
                }
            },
            {
                "uid": 10,
                "type": 84,
                "x": 768,
                "y": 408,
                "props": {},
                "inputs": {
                    "Input 1": 9,
                    "Input 2": 8
                },
                "wires": {
                    "Input 1": {
                        "color": null,
                        "points": [
                            {
                                "x": 744,
                                "y": 597
                            },
                            {
                                "x": 744,
                                "y": 453
                            }
                        ]
                    },
                    "Input 2": {
                        "color": null,
                        "points": [
                            {
                                "x": 744,
                                "y": 429
                            },
                            {
                                "x": 744,
                                "y": 477
                            }
                        ]
                    }
                }
            },
            {
                "uid": 11,
                "type": 49,
                "x": 1008,
                "y": 408,
                "props": {
                    "onlyUpdateWithSet": true
                },
                "inputs": {
                    "Set": 9,
                    "Data": 10
                },
                "wires": {
                    "Set": {
                        "color": null,
                        "points": [
                            {
                                "x": 744,
                                "y": 597
                            },
                            {
                                "x": 744,
                                "y": 696
                            },
                            {
                                "x": 984,
                                "y": 696
                            },
                            {
                                "x": 984,
                                "y": 453
                            }
                        ]
                    },
                    "Data": {
                        "color": null,
                        "points": [
                            {
                                "x": 984,
                                "y": 501
                            },
                            {
                                "x": 984,
                                "y": 477
                            }
                        ]
                    }
                }
            },
            {
                "uid": 12,
                "type": 82,
                "x": 768,
                "y": 576,
                "props": {
                    "value": 0.1
                },
                "inputs": {}
            },
            {
                "uid": 13,
                "type": 85,
                "x": 1248,
                "y": 456,
                "props": {},
                "inputs": {
                    "Input 1": 11,
                    "Input 2": 12
                },
                "wires": {
                    "Input 2": {
                        "color": null,
                        "points": [
                            {
                                "x": 1224,
                                "y": 621
                            },
                            {
                                "x": 1224,
                                "y": 525
                            }
                        ]
                    }
                }
            },
            {
                "uid": 14,
                "type": 89,
                "x": 1488,
                "y": 384,
                "props": {
                    "textColor": "#7ecbff",
                    "bgColor": "#101418"
                },
                "inputs": {
                    "Input": 13
                },
                "wires": {
                    "Input": {
                        "color": null,
                        "points": [
                            {
                                "x": 1464,
                                "y": 549
                            },
                            {
                                "x": 1464,
                                "y": 429
                            }
                        ]
                    }
                }
            },
            {
                "uid": 15,
                "type": 82,
                "x": 1248,
                "y": 624,
                "props": {
                    "value": 200
                },
                "inputs": {}
            },
            {
                "uid": 16,
                "type": 85,
                "x": 1488,
                "y": 528,
                "props": {},
                "inputs": {
                    "Input 1": 13,
                    "Input 2": 15
                },
                "wires": {
                    "Input 1": {
                        "color": null,
                        "points": [
                            {
                                "x": 1464,
                                "y": 549
                            },
                            {
                                "x": 1464,
                                "y": 573
                            }
                        ]
                    },
                    "Input 2": {
                        "color": null,
                        "points": [
                            {
                                "x": 1464,
                                "y": 669
                            },
                            {
                                "x": 1464,
                                "y": 597
                            }
                        ]
                    }
                }
            },
            {
                "uid": 17,
                "type": 89,
                "x": 1728,
                "y": 528,
                "props": {
                    "textColor": "#5dff7a",
                    "bgColor": "#101418"
                },
                "inputs": {
                    "Input": 16
                },
                "wires": {
                    "Input": {
                        "color": null,
                        "points": [
                            {
                                "x": 1704,
                                "y": 621
                            },
                            {
                                "x": 1704,
                                "y": 573
                            }
                        ]
                    }
                }
            },
            {
                "uid": 18,
                "type": 37,
                "x": 48,
                "y": 528,
                "props": {},
                "inputs": {
                    "Input 1": 6,
                    "Input 2": 7
                },
                "wires": {
                    "Input 1": {
                        "color": null,
                        "points": [
                            {
                                "x": 264,
                                "y": 381
                            },
                            {
                                "x": 264,
                                "y": 312
                            },
                            {
                                "x": 0,
                                "y": 312
                            },
                            {
                                "x": 0,
                                "y": 573
                            }
                        ]
                    },
                    "Input 2": {
                        "color": null,
                        "points": [
                            {
                                "x": 504,
                                "y": 405
                            },
                            {
                                "x": 504,
                                "y": 504
                            },
                            {
                                "x": 480,
                                "y": 504
                            },
                            {
                                "x": 480,
                                "y": 840
                            },
                            {
                                "x": 0,
                                "y": 840
                            },
                            {
                                "x": 0,
                                "y": 597
                            }
                        ]
                    }
                }
            },
            {
                "uid": 19,
                "type": 47,
                "x": 48,
                "y": 696,
                "props": {
                    "inputMode": "Brightness",
                    "lightColor": "#ffb84d"
                },
                "inputs": {
                    "Activate": 18
                },
                "wires": {
                    "Activate": {
                        "color": null,
                        "points": [
                            {
                                "x": 264,
                                "y": 621
                            },
                            {
                                "x": 264,
                                "y": 504
                            },
                            {
                                "x": 24,
                                "y": 504
                            },
                            {
                                "x": 24,
                                "y": 741
                            }
                        ]
                    }
                }
            },
            {
                "uid": 20,
                "type": 44,
                "x": 1872,
                "y": 336,
                "props": {
                    "channel": 7
                },
                "inputs": {
                    "Send Signal": 20
                },
                "wires": {
                    "Send Signal": {
                        "color": null,
                        "points": [
                            {
                                "x": 2088,
                                "y": 405
                            },
                            {
                                "x": 2088,
                                "y": 480
                            },
                            {
                                "x": 1848,
                                "y": 480
                            },
                            {
                                "x": 1848,
                                "y": 381
                            }
                        ]
                    }
                }
            },
            {
                "uid": 21,
                "type": 999,
                "x": 1728,
                "y": 648,
                "props": {
                    "text": "^^ Measured Distance"
                },
                "inputs": {}
            },
            {
                "uid": 22,
                "type": 999,
                "x": 1872,
                "y": 240,
                "props": {
                    "text": "VV Move this around and press \"P\" to measure the distance"
                },
                "inputs": {}
            },
            {
                "uid": 23,
                "type": 999,
                "x": 240,
                "y": 696,
                "props": {
                    "text": "<< Flashes when it receives a response"
                },
                "inputs": {}
            }
        ]
    },
    // Sine calculator (range-reduced 13th-order Taylor). Two tricks give it
    // accuracy across the whole number line despite Mechanica having no trig
    // gate and snapping every constant to 0.005 steps:
    //
    //  1. Range reduction. A raw Taylor series is only good near 0, so first
    //     fold x into [-pi, pi] with  r = x - 2*pi*round(x / (2*pi)).  sin(x) =
    //     sin(r), and the polynomial now only ever sees a small angle. 2*pi
    //     can't be typed (6.28318.. snaps to 6.285), so it's built as 710/113
    //     with a Divide gate -- a rational good to ~3e-7.
    //
    //  2. 13th-order Taylor on r, Horner form in u = r^2:
    //       sin(r) ~= r*(1 - u*(1/6 - u*(1/120 - u*(1/5040
    //                   - u*(1/362880 - u*(1/39916800 - u/6227020800))))))
    //     The reciprocal factorials 1/11! and 1/13! are larger than the 10,000,000
    //     constant cap, so each coefficient is made by dividing the previous one
    //     by the next two integers' product: 1/5! = (1/3!)/20, 1/7! = (1/5!)/42,
    //     1/9! = (1/7!)/72, 1/11! = (1/9!)/110, 1/13! = (1/11!)/156.
    //
    // Set x (RADIANS) in the top-left constant; the display reads sin(x). The
    // default 7.855 (~5*pi/2) reads ~1.0 -- proof the range reduction works on a
    // large angle. Max error is ~2e-5 anywhere; near 0 it's ~1e-6.
    sine: {
        "format": "mechanica-sim",
        "version": 1,
        "blocks": [
            { "uid": 1,  "type": 82, "x": 48,   "y": 48,   "props": { "value": 7.855 }, "inputs": {} },
            { "uid": 2,  "type": 82, "x": 48,   "y": 168,  "props": { "value": 1 },     "inputs": {} },
            { "uid": 3,  "type": 82, "x": 48,   "y": 288,  "props": { "value": 710 },   "inputs": {} },
            { "uid": 4,  "type": 82, "x": 48,   "y": 408,  "props": { "value": 113 },   "inputs": {} },
            { "uid": 10, "type": 82, "x": 48,   "y": 528,  "props": { "value": 6 },     "inputs": {} },
            { "uid": 5,  "type": 82, "x": 48,   "y": 648,  "props": { "value": 20 },    "inputs": {} },
            { "uid": 6,  "type": 82, "x": 48,   "y": 768,  "props": { "value": 42 },    "inputs": {} },
            { "uid": 7,  "type": 82, "x": 48,   "y": 888,  "props": { "value": 72 },    "inputs": {} },
            { "uid": 8,  "type": 82, "x": 48,   "y": 1008, "props": { "value": 110 },   "inputs": {} },
            { "uid": 9,  "type": 82, "x": 48,   "y": 1128, "props": { "value": 156 },   "inputs": {} },

            { "uid": 11, "type": 86, "x": 336,  "y": 288,  "props": {}, "inputs": { "Input 1": 3, "Input 2": 4 } },
            { "uid": 12, "type": 86, "x": 600,  "y": 120,  "props": {}, "inputs": { "Input 1": 1, "Input 2": 11 } },
            { "uid": 13, "type": 87, "x": 864,  "y": 120,  "props": { "roundingMode": "Round" }, "inputs": { "Input": 12 } },
            { "uid": 14, "type": 85, "x": 1128, "y": 216,  "props": {}, "inputs": { "Input 1": 11, "Input 2": 13 } },
            { "uid": 15, "type": 84, "x": 1392, "y": 96,   "props": {}, "inputs": { "Input 1": 1, "Input 2": 14 } },
            { "uid": 16, "type": 85, "x": 1656, "y": 96,   "props": {}, "inputs": { "Input 1": 15, "Input 2": 15 } },

            { "uid": 17, "type": 86, "x": 336,  "y": 528,  "props": {}, "inputs": { "Input 1": 2,  "Input 2": 10 } },
            { "uid": 18, "type": 86, "x": 336,  "y": 648,  "props": {}, "inputs": { "Input 1": 17, "Input 2": 5 } },
            { "uid": 19, "type": 86, "x": 336,  "y": 768,  "props": {}, "inputs": { "Input 1": 18, "Input 2": 6 } },
            { "uid": 20, "type": 86, "x": 336,  "y": 888,  "props": {}, "inputs": { "Input 1": 19, "Input 2": 7 } },
            { "uid": 21, "type": 86, "x": 336,  "y": 1008, "props": {}, "inputs": { "Input 1": 20, "Input 2": 8 } },
            { "uid": 22, "type": 86, "x": 336,  "y": 1128, "props": {}, "inputs": { "Input 1": 21, "Input 2": 9 } },

            { "uid": 23, "type": 85, "x": 1920, "y": 528,  "props": {}, "inputs": { "Input 1": 16, "Input 2": 22 } },
            { "uid": 24, "type": 84, "x": 1920, "y": 672,  "props": {}, "inputs": { "Input 1": 21, "Input 2": 23 } },
            { "uid": 25, "type": 85, "x": 2184, "y": 528,  "props": {}, "inputs": { "Input 1": 16, "Input 2": 24 } },
            { "uid": 26, "type": 84, "x": 2184, "y": 672,  "props": {}, "inputs": { "Input 1": 20, "Input 2": 25 } },
            { "uid": 27, "type": 85, "x": 2448, "y": 528,  "props": {}, "inputs": { "Input 1": 16, "Input 2": 26 } },
            { "uid": 28, "type": 84, "x": 2448, "y": 672,  "props": {}, "inputs": { "Input 1": 19, "Input 2": 27 } },
            { "uid": 29, "type": 85, "x": 2712, "y": 528,  "props": {}, "inputs": { "Input 1": 16, "Input 2": 28 } },
            { "uid": 30, "type": 84, "x": 2712, "y": 672,  "props": {}, "inputs": { "Input 1": 18, "Input 2": 29 } },
            { "uid": 31, "type": 85, "x": 2976, "y": 528,  "props": {}, "inputs": { "Input 1": 16, "Input 2": 30 } },
            { "uid": 32, "type": 84, "x": 2976, "y": 672,  "props": {}, "inputs": { "Input 1": 17, "Input 2": 31 } },
            { "uid": 33, "type": 85, "x": 3240, "y": 528,  "props": {}, "inputs": { "Input 1": 16, "Input 2": 32 } },
            { "uid": 34, "type": 84, "x": 3240, "y": 672,  "props": {}, "inputs": { "Input 1": 2,  "Input 2": 33 } },

            { "uid": 35, "type": 85, "x": 3504, "y": 384,  "props": {}, "inputs": { "Input 1": 15, "Input 2": 34 } },
            {
                "uid": 36, "type": 89, "x": 3768, "y": 384,
                "props": { "textColor": "#7ecbff", "bgColor": "#101418" },
                "inputs": { "Input": 35 }
            },

            {
                "uid": 37, "type": 999, "x": 48, "y": 1272,
                "props": { "text": "Set x (radians) in the top-left constant; the display reads sin(x).\nRange reduction folds x into [-pi, pi] (r = x - 2pi*round(x/2pi)),\nthen a 13th-order Taylor series is evaluated on r. Accurate for any x." },
                "inputs": {}
            },
            {
                "uid": 38, "type": 999, "x": 336, "y": 1272,
                "props": { "text": "2pi = 710/113 and the 1/n! coefficients are built with Divide gates:\nthe game snaps constants to 0.005 steps and caps them at 10,000,000,\nso 6.28318.. and 1/11!, 1/13! can't be typed directly." },
                "inputs": {}
            },
            {
                "uid": 39, "type": 999, "x": 3768, "y": 528,
                "props": { "text": "^^ sin(x)" },
                "inputs": {}
            }
        ]
    },
};