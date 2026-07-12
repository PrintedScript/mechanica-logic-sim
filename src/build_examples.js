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
};