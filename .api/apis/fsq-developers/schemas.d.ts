declare const AddressDetails: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly fsq_addr_id: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A unique string identifier used to retrieve further details for an address result returned by the [autocomplete endpoint](https://docs.foursquare.com/reference/autocomplete). Note this id format may change or be updated in the future and therefore should be treated as temporary.";
                };
            };
            readonly required: readonly ["fsq_addr_id"];
        }, {
            readonly type: "object";
            readonly properties: {
                readonly session_token: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A user-generated token to identify a session for billing purposes. Learn more about [session tokens](https://docs.foursquare.com/reference/session-tokens).";
                };
            };
            readonly required: readonly [];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly fsq_addr_id: {
                    readonly type: "string";
                };
                readonly location: {
                    readonly type: "object";
                    readonly properties: {
                        readonly address: {
                            readonly type: "string";
                        };
                        readonly address_extended: {
                            readonly type: "string";
                        };
                        readonly admin_region: {
                            readonly type: "string";
                        };
                        readonly census_block: {
                            readonly type: "string";
                        };
                        readonly country: {
                            readonly type: "string";
                        };
                        readonly cross_street: {
                            readonly type: "string";
                        };
                        readonly dma: {
                            readonly type: "string";
                        };
                        readonly formatted_address: {
                            readonly type: "string";
                        };
                        readonly locality: {
                            readonly type: "string";
                        };
                        readonly neighborhood: {
                            readonly type: "array";
                            readonly properties: {
                                readonly traversable_again: {
                                    readonly type: "boolean";
                                };
                            };
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly po_box: {
                            readonly type: "string";
                        };
                        readonly post_town: {
                            readonly type: "string";
                        };
                        readonly postcode: {
                            readonly type: "string";
                        };
                        readonly region: {
                            readonly type: "string";
                        };
                    };
                };
                readonly geocodes: {
                    readonly type: "object";
                    readonly properties: {
                        readonly drop_off: {
                            readonly type: "object";
                            readonly properties: {
                                readonly latitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                                readonly longitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                            };
                        };
                        readonly front_door: {
                            readonly type: "object";
                            readonly properties: {
                                readonly latitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                                readonly longitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                            };
                        };
                        readonly main: {
                            readonly type: "object";
                            readonly properties: {
                                readonly latitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                                readonly longitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                            };
                        };
                        readonly road: {
                            readonly type: "object";
                            readonly properties: {
                                readonly latitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                                readonly longitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                            };
                        };
                        readonly roof: {
                            readonly type: "object";
                            readonly properties: {
                                readonly latitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                                readonly longitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                            };
                        };
                    };
                };
                readonly directory: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly fsq_id: {
                                readonly type: "string";
                            };
                            readonly categories: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly name: {
                                            readonly type: "string";
                                        };
                                        readonly short_name: {
                                            readonly type: "string";
                                        };
                                        readonly plural_name: {
                                            readonly type: "string";
                                        };
                                        readonly icon: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly id: {
                                                    readonly type: "string";
                                                };
                                                readonly created_at: {
                                                    readonly type: "string";
                                                    readonly format: "date-time";
                                                };
                                                readonly prefix: {
                                                    readonly type: "string";
                                                };
                                                readonly suffix: {
                                                    readonly type: "string";
                                                };
                                                readonly width: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly height: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly classifications: {
                                                    readonly type: "array";
                                                    readonly properties: {
                                                        readonly traversable_again: {
                                                            readonly type: "boolean";
                                                        };
                                                    };
                                                    readonly items: {
                                                        readonly type: "string";
                                                    };
                                                };
                                                readonly tip: {
                                                    readonly type: "object";
                                                    readonly properties: {
                                                        readonly id: {
                                                            readonly type: "string";
                                                        };
                                                        readonly created_at: {
                                                            readonly type: "string";
                                                            readonly format: "date-time";
                                                        };
                                                        readonly text: {
                                                            readonly type: "string";
                                                        };
                                                        readonly url: {
                                                            readonly type: "string";
                                                        };
                                                        readonly photo: {};
                                                        readonly lang: {
                                                            readonly type: "string";
                                                        };
                                                        readonly agree_count: {
                                                            readonly type: "integer";
                                                            readonly format: "int32";
                                                            readonly minimum: -2147483648;
                                                            readonly maximum: 2147483647;
                                                        };
                                                        readonly disagree_count: {
                                                            readonly type: "integer";
                                                            readonly format: "int32";
                                                            readonly minimum: -2147483648;
                                                            readonly maximum: 2147483647;
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly chains: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "string";
                                        };
                                        readonly name: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                            };
                            readonly closed_bucket: {
                                readonly type: "string";
                            };
                            readonly date_closed: {
                                readonly type: "string";
                                readonly format: "date";
                            };
                            readonly description: {
                                readonly type: "string";
                            };
                            readonly distance: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly email: {
                                readonly type: "string";
                            };
                            readonly fax: {
                                readonly type: "string";
                            };
                            readonly features: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly payment: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly credit_cards: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly accepts_credit_cards: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly amex: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly discover: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly visa: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly diners_club: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly master_card: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly union_pay: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                            readonly digital_wallet: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly accepts_nfc: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly food_and_drink: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly alcohol: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly bar_service: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly beer: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly byo: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly cocktails: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly full_bar: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly wine: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                            readonly meals: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly bar_snacks: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly breakfast: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly brunch: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly lunch: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly happy_hour: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly dessert: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly dinner: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly tasting_menu: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly services: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly delivery: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly takeout: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly drive_through: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly dine_in: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly online_reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly groups_only_reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly essential_reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly amenities: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly restroom: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly smoking: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly jukebox: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly music: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly live_music: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly private_room: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly outdoor_seating: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly tvs: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly atm: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly coat_check: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly wheelchair_accessible: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly parking: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly parking: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly street_parking: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly valet_parking: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly public_lot: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly private_lot: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                            readonly sit_down_dining: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly wifi: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                    readonly attributes: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly business_meeting: {
                                                readonly type: "string";
                                            };
                                            readonly clean: {
                                                readonly type: "string";
                                            };
                                            readonly crowded: {
                                                readonly type: "string";
                                            };
                                            readonly dates_popular: {
                                                readonly type: "string";
                                            };
                                            readonly dressy: {
                                                readonly type: "string";
                                            };
                                            readonly families_popular: {
                                                readonly type: "string";
                                            };
                                            readonly gluten_free_diet: {
                                                readonly type: "string";
                                            };
                                            readonly good_for_dogs: {
                                                readonly type: "string";
                                            };
                                            readonly groups_popular: {
                                                readonly type: "string";
                                            };
                                            readonly healthy_diet: {
                                                readonly type: "string";
                                            };
                                            readonly late_night: {
                                                readonly type: "string";
                                            };
                                            readonly noisy: {
                                                readonly type: "string";
                                            };
                                            readonly quick_bite: {
                                                readonly type: "string";
                                            };
                                            readonly romantic: {
                                                readonly type: "string";
                                            };
                                            readonly service_quality: {
                                                readonly type: "string";
                                            };
                                            readonly singles_popular: {
                                                readonly type: "string";
                                            };
                                            readonly special_occasion: {
                                                readonly type: "string";
                                            };
                                            readonly trendy: {
                                                readonly type: "string";
                                            };
                                            readonly value_for_money: {
                                                readonly type: "string";
                                            };
                                            readonly vegan_diet: {
                                                readonly type: "string";
                                            };
                                            readonly vegetarian_diet: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                };
                            };
                            readonly geocodes: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly drop_off: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly front_door: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly main: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly road: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly roof: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                };
                            };
                            readonly hours: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly display: {
                                        readonly type: "string";
                                    };
                                    readonly is_local_holiday: {
                                        readonly type: "boolean";
                                    };
                                    readonly open_now: {
                                        readonly type: "boolean";
                                    };
                                    readonly regular: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly close: {
                                                    readonly type: "string";
                                                };
                                                readonly day: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly open: {
                                                    readonly type: "string";
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly hours_popular: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly close: {
                                            readonly type: "string";
                                        };
                                        readonly day: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly open: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                            };
                            readonly link: {
                                readonly type: "string";
                            };
                            readonly location: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly address: {
                                        readonly type: "string";
                                    };
                                    readonly address_extended: {
                                        readonly type: "string";
                                    };
                                    readonly admin_region: {
                                        readonly type: "string";
                                    };
                                    readonly census_block: {
                                        readonly type: "string";
                                    };
                                    readonly country: {
                                        readonly type: "string";
                                    };
                                    readonly cross_street: {
                                        readonly type: "string";
                                    };
                                    readonly dma: {
                                        readonly type: "string";
                                    };
                                    readonly formatted_address: {
                                        readonly type: "string";
                                    };
                                    readonly locality: {
                                        readonly type: "string";
                                    };
                                    readonly neighborhood: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly po_box: {
                                        readonly type: "string";
                                    };
                                    readonly post_town: {
                                        readonly type: "string";
                                    };
                                    readonly postcode: {
                                        readonly type: "string";
                                    };
                                    readonly region: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly menu: {
                                readonly type: "string";
                            };
                            readonly name: {
                                readonly type: "string";
                            };
                            readonly photos: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "string";
                                        };
                                        readonly created_at: {
                                            readonly type: "string";
                                            readonly format: "date-time";
                                        };
                                        readonly prefix: {
                                            readonly type: "string";
                                        };
                                        readonly suffix: {
                                            readonly type: "string";
                                        };
                                        readonly width: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly height: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly classifications: {
                                            readonly type: "array";
                                            readonly properties: {
                                                readonly traversable_again: {
                                                    readonly type: "boolean";
                                                };
                                            };
                                            readonly items: {
                                                readonly type: "string";
                                            };
                                        };
                                        readonly tip: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly id: {
                                                    readonly type: "string";
                                                };
                                                readonly created_at: {
                                                    readonly type: "string";
                                                    readonly format: "date-time";
                                                };
                                                readonly text: {
                                                    readonly type: "string";
                                                };
                                                readonly url: {
                                                    readonly type: "string";
                                                };
                                                readonly photo: {};
                                                readonly lang: {
                                                    readonly type: "string";
                                                };
                                                readonly agree_count: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly disagree_count: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly popularity: {
                                readonly type: "number";
                                readonly format: "double";
                                readonly minimum: -1.7976931348623157e+308;
                                readonly maximum: 1.7976931348623157e+308;
                            };
                            readonly price: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly rating: {
                                readonly type: "number";
                                readonly format: "double";
                                readonly minimum: -1.7976931348623157e+308;
                                readonly maximum: 1.7976931348623157e+308;
                            };
                            readonly related_places: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly parent: {};
                                };
                            };
                            readonly social_media: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly facebook_id: {
                                        readonly type: "string";
                                    };
                                    readonly instagram: {
                                        readonly type: "string";
                                    };
                                    readonly twitter: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly stats: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly total_photos: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly total_ratings: {
                                        readonly type: "integer";
                                        readonly format: "int64";
                                        readonly minimum: -9223372036854776000;
                                        readonly maximum: 9223372036854776000;
                                    };
                                    readonly total_tips: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                };
                            };
                            readonly store_id: {
                                readonly type: "string";
                            };
                            readonly tastes: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly tel: {
                                readonly type: "string";
                            };
                            readonly timezone: {
                                readonly type: "string";
                            };
                            readonly tips: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "string";
                                        };
                                        readonly created_at: {
                                            readonly type: "string";
                                            readonly format: "date-time";
                                        };
                                        readonly text: {
                                            readonly type: "string";
                                        };
                                        readonly url: {
                                            readonly type: "string";
                                        };
                                        readonly photo: {};
                                        readonly lang: {
                                            readonly type: "string";
                                        };
                                        readonly agree_count: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly disagree_count: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                    };
                                };
                            };
                            readonly venue_reality_bucket: {
                                readonly type: "string";
                            };
                            readonly verified: {
                                readonly type: "boolean";
                            };
                            readonly website: {
                                readonly type: "string";
                            };
                        };
                    };
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
declare const Autocomplete: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly query: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A search term to be applied against titles. Must be at least 3 characters long.";
                };
                readonly ll: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The latitude/longitude around which you wish to retrieve place information. Specified as latitude,longitude (e.g., ll=41.8781,-87.6298). If you do not specify ll, the server will attempt to retrieve the IP address from the request, and geolocate that IP address.";
                };
                readonly radius: {
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly minimum: -2147483648;
                    readonly maximum: 2147483647;
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Defines the distance (in meters) within which to return place results. Setting a radius biases the results to the indicated area, but may not fully restrict results to that specified area. If not provided, default radius is set to 5000 meters.";
                };
                readonly types: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The types of results to return; any combination of place, address, search, and/or geo.If no types are specified, all types will be returned.";
                };
                readonly bias: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Bias the autocomplete results by a specific type; one of place, address, search, or geo.";
                };
                readonly session_token: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A user-generated token to to group the user's query and the user's selected result into a discrete session for billing purposes. Learn more about [session tokens](https://docs.foursquare.com/reference/session-tokens).\n\n*If the session_token parameter is omitted, the session is charged per keystroke/request.*";
                };
                readonly limit: {
                    readonly maximum: 50;
                    readonly minimum: 1;
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The number of results to return, up to 50. Defaults to 10.";
                };
            };
            readonly required: readonly ["query"];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly results: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly type: {
                                readonly type: "string";
                            };
                            readonly text: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly primary: {
                                        readonly type: "string";
                                    };
                                    readonly secondary: {
                                        readonly type: "string";
                                    };
                                    readonly highlight: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly start: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly length: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly icon: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly id: {
                                        readonly type: "string";
                                    };
                                    readonly created_at: {
                                        readonly type: "string";
                                        readonly format: "date-time";
                                    };
                                    readonly prefix: {
                                        readonly type: "string";
                                    };
                                    readonly suffix: {
                                        readonly type: "string";
                                    };
                                    readonly width: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly height: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly classifications: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly tip: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly id: {
                                                readonly type: "string";
                                            };
                                            readonly created_at: {
                                                readonly type: "string";
                                                readonly format: "date-time";
                                            };
                                            readonly text: {
                                                readonly type: "string";
                                            };
                                            readonly url: {
                                                readonly type: "string";
                                            };
                                            readonly photo: {};
                                            readonly lang: {
                                                readonly type: "string";
                                            };
                                            readonly agree_count: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                            readonly disagree_count: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                        };
                                    };
                                };
                            };
                            readonly link: {
                                readonly type: "string";
                            };
                            readonly place: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly fsq_id: {
                                        readonly type: "string";
                                    };
                                    readonly categories: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly id: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly name: {
                                                    readonly type: "string";
                                                };
                                                readonly short_name: {
                                                    readonly type: "string";
                                                };
                                                readonly plural_name: {
                                                    readonly type: "string";
                                                };
                                                readonly icon: {
                                                    readonly type: "object";
                                                    readonly properties: {
                                                        readonly id: {
                                                            readonly type: "string";
                                                        };
                                                        readonly created_at: {
                                                            readonly type: "string";
                                                            readonly format: "date-time";
                                                        };
                                                        readonly prefix: {
                                                            readonly type: "string";
                                                        };
                                                        readonly suffix: {
                                                            readonly type: "string";
                                                        };
                                                        readonly width: {
                                                            readonly type: "integer";
                                                            readonly format: "int32";
                                                            readonly minimum: -2147483648;
                                                            readonly maximum: 2147483647;
                                                        };
                                                        readonly height: {
                                                            readonly type: "integer";
                                                            readonly format: "int32";
                                                            readonly minimum: -2147483648;
                                                            readonly maximum: 2147483647;
                                                        };
                                                        readonly classifications: {
                                                            readonly type: "array";
                                                            readonly properties: {
                                                                readonly traversable_again: {
                                                                    readonly type: "boolean";
                                                                };
                                                            };
                                                            readonly items: {
                                                                readonly type: "string";
                                                            };
                                                        };
                                                        readonly tip: {
                                                            readonly type: "object";
                                                            readonly properties: {
                                                                readonly id: {
                                                                    readonly type: "string";
                                                                };
                                                                readonly created_at: {
                                                                    readonly type: "string";
                                                                    readonly format: "date-time";
                                                                };
                                                                readonly text: {
                                                                    readonly type: "string";
                                                                };
                                                                readonly url: {
                                                                    readonly type: "string";
                                                                };
                                                                readonly photo: {};
                                                                readonly lang: {
                                                                    readonly type: "string";
                                                                };
                                                                readonly agree_count: {
                                                                    readonly type: "integer";
                                                                    readonly format: "int32";
                                                                    readonly minimum: -2147483648;
                                                                    readonly maximum: 2147483647;
                                                                };
                                                                readonly disagree_count: {
                                                                    readonly type: "integer";
                                                                    readonly format: "int32";
                                                                    readonly minimum: -2147483648;
                                                                    readonly maximum: 2147483647;
                                                                };
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly chains: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly id: {
                                                    readonly type: "string";
                                                };
                                                readonly name: {
                                                    readonly type: "string";
                                                };
                                            };
                                        };
                                    };
                                    readonly closed_bucket: {
                                        readonly type: "string";
                                    };
                                    readonly date_closed: {
                                        readonly type: "string";
                                        readonly format: "date";
                                    };
                                    readonly description: {
                                        readonly type: "string";
                                    };
                                    readonly distance: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly email: {
                                        readonly type: "string";
                                    };
                                    readonly fax: {
                                        readonly type: "string";
                                    };
                                    readonly features: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly payment: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly credit_cards: {
                                                        readonly type: "object";
                                                        readonly properties: {
                                                            readonly accepts_credit_cards: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly amex: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly discover: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly visa: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly diners_club: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly master_card: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly union_pay: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                        };
                                                    };
                                                    readonly digital_wallet: {
                                                        readonly type: "object";
                                                        readonly properties: {
                                                            readonly accepts_nfc: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                            readonly food_and_drink: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly alcohol: {
                                                        readonly type: "object";
                                                        readonly properties: {
                                                            readonly bar_service: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly beer: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly byo: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly cocktails: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly full_bar: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly wine: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                        };
                                                    };
                                                    readonly meals: {
                                                        readonly type: "object";
                                                        readonly properties: {
                                                            readonly bar_snacks: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly breakfast: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly brunch: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly lunch: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly happy_hour: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly dessert: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly dinner: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly tasting_menu: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                            readonly services: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly delivery: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly takeout: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly drive_through: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly dine_in: {
                                                        readonly type: "object";
                                                        readonly properties: {
                                                            readonly reservations: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly online_reservations: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly groups_only_reservations: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly essential_reservations: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                            readonly amenities: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly restroom: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly smoking: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly jukebox: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly music: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly live_music: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly private_room: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly outdoor_seating: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly tvs: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly atm: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly coat_check: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly wheelchair_accessible: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly parking: {
                                                        readonly type: "object";
                                                        readonly properties: {
                                                            readonly parking: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly street_parking: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly valet_parking: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly public_lot: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                            readonly private_lot: {
                                                                readonly type: "object";
                                                                readonly additionalProperties: true;
                                                            };
                                                        };
                                                    };
                                                    readonly sit_down_dining: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly wifi: {
                                                        readonly type: "string";
                                                    };
                                                };
                                            };
                                            readonly attributes: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly business_meeting: {
                                                        readonly type: "string";
                                                    };
                                                    readonly clean: {
                                                        readonly type: "string";
                                                    };
                                                    readonly crowded: {
                                                        readonly type: "string";
                                                    };
                                                    readonly dates_popular: {
                                                        readonly type: "string";
                                                    };
                                                    readonly dressy: {
                                                        readonly type: "string";
                                                    };
                                                    readonly families_popular: {
                                                        readonly type: "string";
                                                    };
                                                    readonly gluten_free_diet: {
                                                        readonly type: "string";
                                                    };
                                                    readonly good_for_dogs: {
                                                        readonly type: "string";
                                                    };
                                                    readonly groups_popular: {
                                                        readonly type: "string";
                                                    };
                                                    readonly healthy_diet: {
                                                        readonly type: "string";
                                                    };
                                                    readonly late_night: {
                                                        readonly type: "string";
                                                    };
                                                    readonly noisy: {
                                                        readonly type: "string";
                                                    };
                                                    readonly quick_bite: {
                                                        readonly type: "string";
                                                    };
                                                    readonly romantic: {
                                                        readonly type: "string";
                                                    };
                                                    readonly service_quality: {
                                                        readonly type: "string";
                                                    };
                                                    readonly singles_popular: {
                                                        readonly type: "string";
                                                    };
                                                    readonly special_occasion: {
                                                        readonly type: "string";
                                                    };
                                                    readonly trendy: {
                                                        readonly type: "string";
                                                    };
                                                    readonly value_for_money: {
                                                        readonly type: "string";
                                                    };
                                                    readonly vegan_diet: {
                                                        readonly type: "string";
                                                    };
                                                    readonly vegetarian_diet: {
                                                        readonly type: "string";
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly geocodes: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly drop_off: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly latitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                    readonly longitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                };
                                            };
                                            readonly front_door: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly latitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                    readonly longitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                };
                                            };
                                            readonly main: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly latitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                    readonly longitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                };
                                            };
                                            readonly road: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly latitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                    readonly longitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                };
                                            };
                                            readonly roof: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly latitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                    readonly longitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly hours: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly display: {
                                                readonly type: "string";
                                            };
                                            readonly is_local_holiday: {
                                                readonly type: "boolean";
                                            };
                                            readonly open_now: {
                                                readonly type: "boolean";
                                            };
                                            readonly regular: {
                                                readonly type: "array";
                                                readonly properties: {
                                                    readonly traversable_again: {
                                                        readonly type: "boolean";
                                                    };
                                                };
                                                readonly items: {
                                                    readonly type: "object";
                                                    readonly properties: {
                                                        readonly close: {
                                                            readonly type: "string";
                                                        };
                                                        readonly day: {
                                                            readonly type: "integer";
                                                            readonly format: "int32";
                                                            readonly minimum: -2147483648;
                                                            readonly maximum: 2147483647;
                                                        };
                                                        readonly open: {
                                                            readonly type: "string";
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly hours_popular: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly close: {
                                                    readonly type: "string";
                                                };
                                                readonly day: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly open: {
                                                    readonly type: "string";
                                                };
                                            };
                                        };
                                    };
                                    readonly link: {
                                        readonly type: "string";
                                    };
                                    readonly location: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly address: {
                                                readonly type: "string";
                                            };
                                            readonly address_extended: {
                                                readonly type: "string";
                                            };
                                            readonly admin_region: {
                                                readonly type: "string";
                                            };
                                            readonly census_block: {
                                                readonly type: "string";
                                            };
                                            readonly country: {
                                                readonly type: "string";
                                            };
                                            readonly cross_street: {
                                                readonly type: "string";
                                            };
                                            readonly dma: {
                                                readonly type: "string";
                                            };
                                            readonly formatted_address: {
                                                readonly type: "string";
                                            };
                                            readonly locality: {
                                                readonly type: "string";
                                            };
                                            readonly neighborhood: {
                                                readonly type: "array";
                                                readonly properties: {
                                                    readonly traversable_again: {
                                                        readonly type: "boolean";
                                                    };
                                                };
                                                readonly items: {
                                                    readonly type: "string";
                                                };
                                            };
                                            readonly po_box: {
                                                readonly type: "string";
                                            };
                                            readonly post_town: {
                                                readonly type: "string";
                                            };
                                            readonly postcode: {
                                                readonly type: "string";
                                            };
                                            readonly region: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                    readonly menu: {
                                        readonly type: "string";
                                    };
                                    readonly name: {
                                        readonly type: "string";
                                    };
                                    readonly photos: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly id: {
                                                    readonly type: "string";
                                                };
                                                readonly created_at: {
                                                    readonly type: "string";
                                                    readonly format: "date-time";
                                                };
                                                readonly prefix: {
                                                    readonly type: "string";
                                                };
                                                readonly suffix: {
                                                    readonly type: "string";
                                                };
                                                readonly width: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly height: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly classifications: {
                                                    readonly type: "array";
                                                    readonly properties: {
                                                        readonly traversable_again: {
                                                            readonly type: "boolean";
                                                        };
                                                    };
                                                    readonly items: {
                                                        readonly type: "string";
                                                    };
                                                };
                                                readonly tip: {
                                                    readonly type: "object";
                                                    readonly properties: {
                                                        readonly id: {
                                                            readonly type: "string";
                                                        };
                                                        readonly created_at: {
                                                            readonly type: "string";
                                                            readonly format: "date-time";
                                                        };
                                                        readonly text: {
                                                            readonly type: "string";
                                                        };
                                                        readonly url: {
                                                            readonly type: "string";
                                                        };
                                                        readonly photo: {};
                                                        readonly lang: {
                                                            readonly type: "string";
                                                        };
                                                        readonly agree_count: {
                                                            readonly type: "integer";
                                                            readonly format: "int32";
                                                            readonly minimum: -2147483648;
                                                            readonly maximum: 2147483647;
                                                        };
                                                        readonly disagree_count: {
                                                            readonly type: "integer";
                                                            readonly format: "int32";
                                                            readonly minimum: -2147483648;
                                                            readonly maximum: 2147483647;
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly popularity: {
                                        readonly type: "number";
                                        readonly format: "double";
                                        readonly minimum: -1.7976931348623157e+308;
                                        readonly maximum: 1.7976931348623157e+308;
                                    };
                                    readonly price: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly rating: {
                                        readonly type: "number";
                                        readonly format: "double";
                                        readonly minimum: -1.7976931348623157e+308;
                                        readonly maximum: 1.7976931348623157e+308;
                                    };
                                    readonly related_places: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly parent: {};
                                        };
                                    };
                                    readonly social_media: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly facebook_id: {
                                                readonly type: "string";
                                            };
                                            readonly instagram: {
                                                readonly type: "string";
                                            };
                                            readonly twitter: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                    readonly stats: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly total_photos: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                            readonly total_ratings: {
                                                readonly type: "integer";
                                                readonly format: "int64";
                                                readonly minimum: -9223372036854776000;
                                                readonly maximum: 9223372036854776000;
                                            };
                                            readonly total_tips: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                        };
                                    };
                                    readonly store_id: {
                                        readonly type: "string";
                                    };
                                    readonly tastes: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly tel: {
                                        readonly type: "string";
                                    };
                                    readonly timezone: {
                                        readonly type: "string";
                                    };
                                    readonly tips: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly id: {
                                                    readonly type: "string";
                                                };
                                                readonly created_at: {
                                                    readonly type: "string";
                                                    readonly format: "date-time";
                                                };
                                                readonly text: {
                                                    readonly type: "string";
                                                };
                                                readonly url: {
                                                    readonly type: "string";
                                                };
                                                readonly photo: {};
                                                readonly lang: {
                                                    readonly type: "string";
                                                };
                                                readonly agree_count: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly disagree_count: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                            };
                                        };
                                    };
                                    readonly venue_reality_bucket: {
                                        readonly type: "string";
                                    };
                                    readonly verified: {
                                        readonly type: "boolean";
                                    };
                                    readonly website: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly address: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly address_id: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly search: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly query: {
                                        readonly type: "string";
                                    };
                                    readonly category: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly id: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                            readonly name: {
                                                readonly type: "string";
                                            };
                                            readonly short_name: {
                                                readonly type: "string";
                                            };
                                            readonly plural_name: {
                                                readonly type: "string";
                                            };
                                            readonly icon: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly id: {
                                                        readonly type: "string";
                                                    };
                                                    readonly created_at: {
                                                        readonly type: "string";
                                                        readonly format: "date-time";
                                                    };
                                                    readonly prefix: {
                                                        readonly type: "string";
                                                    };
                                                    readonly suffix: {
                                                        readonly type: "string";
                                                    };
                                                    readonly width: {
                                                        readonly type: "integer";
                                                        readonly format: "int32";
                                                        readonly minimum: -2147483648;
                                                        readonly maximum: 2147483647;
                                                    };
                                                    readonly height: {
                                                        readonly type: "integer";
                                                        readonly format: "int32";
                                                        readonly minimum: -2147483648;
                                                        readonly maximum: 2147483647;
                                                    };
                                                    readonly classifications: {
                                                        readonly type: "array";
                                                        readonly properties: {
                                                            readonly traversable_again: {
                                                                readonly type: "boolean";
                                                            };
                                                        };
                                                        readonly items: {
                                                            readonly type: "string";
                                                        };
                                                    };
                                                    readonly tip: {
                                                        readonly type: "object";
                                                        readonly properties: {
                                                            readonly id: {
                                                                readonly type: "string";
                                                            };
                                                            readonly created_at: {
                                                                readonly type: "string";
                                                                readonly format: "date-time";
                                                            };
                                                            readonly text: {
                                                                readonly type: "string";
                                                            };
                                                            readonly url: {
                                                                readonly type: "string";
                                                            };
                                                            readonly photo: {};
                                                            readonly lang: {
                                                                readonly type: "string";
                                                            };
                                                            readonly agree_count: {
                                                                readonly type: "integer";
                                                                readonly format: "int32";
                                                                readonly minimum: -2147483648;
                                                                readonly maximum: 2147483647;
                                                            };
                                                            readonly disagree_count: {
                                                                readonly type: "integer";
                                                                readonly format: "int32";
                                                                readonly minimum: -2147483648;
                                                                readonly maximum: 2147483647;
                                                            };
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly chain: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly id: {
                                                readonly type: "string";
                                            };
                                            readonly name: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                };
                            };
                            readonly geo: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly name: {
                                        readonly type: "string";
                                    };
                                    readonly center: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly bounds: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly ne: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly latitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                    readonly longitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                };
                                            };
                                            readonly sw: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly latitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                    readonly longitude: {
                                                        readonly type: "number";
                                                        readonly format: "double";
                                                        readonly minimum: -1.7976931348623157e+308;
                                                        readonly maximum: 1.7976931348623157e+308;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly cc: {
                                        readonly type: "string";
                                    };
                                    readonly type: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly debug: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly score: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                };
                            };
                        };
                    };
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
declare const FeedbackStatus: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly proposed_edit_ids: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A comma seperated list of proposed edit ids. If specified, shows only proposed edits with these IDs";
                };
                readonly limit: {
                    readonly maximum: 50;
                    readonly minimum: 0;
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The specified number of proposed edits per page. Returns 10 proposed edits by default, up to a maximum number of 50.";
                };
            };
            readonly required: readonly [];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly woes: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly id: {
                                readonly type: "string";
                            };
                            readonly fsq_id: {
                                readonly type: "string";
                            };
                            readonly proposed_edit_type: {
                                readonly type: "string";
                            };
                            readonly created_at: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly resolved_time: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly rolled_back: {
                                readonly type: "object";
                                readonly additionalProperties: true;
                            };
                            readonly status: {
                                readonly type: "string";
                            };
                        };
                    };
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
declare const PlaceDetails: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly fsq_id: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A unique string identifier for a FSQ Place (formerly known as Venue ID). E.g., Foursquare HQ's fsq_id = 5a187743ccad6b307315e6fe";
                };
            };
            readonly required: readonly ["fsq_id"];
        }, {
            readonly type: "object";
            readonly properties: {
                readonly fields: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Indicate which fields to return in the response, separated by commas. If no fields are specified, all <a href=\"https://docs.foursquare.com/reference/response-fields#core-data-fields\" target=\"_blank\">Core Fields</a> are returned by default. \n\nFor a complete list of returnable fields, refer to the <a href=\"https://docs.foursquare.com/reference/response-fields\" target=\"_blank\">Response Fields</a> page.";
                };
                readonly session_token: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A user-generated token to identify a session for billing purposes. Learn more about [session tokens](https://docs.foursquare.com/reference/session-tokens).";
                };
            };
            readonly required: readonly [];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly fsq_id: {
                    readonly type: "string";
                };
                readonly categories: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly id: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly name: {
                                readonly type: "string";
                            };
                            readonly short_name: {
                                readonly type: "string";
                            };
                            readonly plural_name: {
                                readonly type: "string";
                            };
                            readonly icon: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly id: {
                                        readonly type: "string";
                                    };
                                    readonly created_at: {
                                        readonly type: "string";
                                        readonly format: "date-time";
                                    };
                                    readonly prefix: {
                                        readonly type: "string";
                                    };
                                    readonly suffix: {
                                        readonly type: "string";
                                    };
                                    readonly width: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly height: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly classifications: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly tip: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly id: {
                                                readonly type: "string";
                                            };
                                            readonly created_at: {
                                                readonly type: "string";
                                                readonly format: "date-time";
                                            };
                                            readonly text: {
                                                readonly type: "string";
                                            };
                                            readonly url: {
                                                readonly type: "string";
                                            };
                                            readonly photo: {};
                                            readonly lang: {
                                                readonly type: "string";
                                            };
                                            readonly agree_count: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                            readonly disagree_count: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
                readonly chains: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly id: {
                                readonly type: "string";
                            };
                            readonly name: {
                                readonly type: "string";
                            };
                        };
                    };
                };
                readonly closed_bucket: {
                    readonly type: "string";
                };
                readonly date_closed: {
                    readonly type: "string";
                    readonly format: "date";
                };
                readonly description: {
                    readonly type: "string";
                };
                readonly distance: {
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly minimum: -2147483648;
                    readonly maximum: 2147483647;
                };
                readonly email: {
                    readonly type: "string";
                };
                readonly fax: {
                    readonly type: "string";
                };
                readonly features: {
                    readonly type: "object";
                    readonly properties: {
                        readonly payment: {
                            readonly type: "object";
                            readonly properties: {
                                readonly credit_cards: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly accepts_credit_cards: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly amex: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly discover: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly visa: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly diners_club: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly master_card: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly union_pay: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                    };
                                };
                                readonly digital_wallet: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly accepts_nfc: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                    };
                                };
                            };
                        };
                        readonly food_and_drink: {
                            readonly type: "object";
                            readonly properties: {
                                readonly alcohol: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly bar_service: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly beer: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly byo: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly cocktails: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly full_bar: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly wine: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                    };
                                };
                                readonly meals: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly bar_snacks: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly breakfast: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly brunch: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly lunch: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly happy_hour: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly dessert: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly dinner: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly tasting_menu: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                    };
                                };
                            };
                        };
                        readonly services: {
                            readonly type: "object";
                            readonly properties: {
                                readonly delivery: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly takeout: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly drive_through: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly dine_in: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly reservations: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly online_reservations: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly groups_only_reservations: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly essential_reservations: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                    };
                                };
                            };
                        };
                        readonly amenities: {
                            readonly type: "object";
                            readonly properties: {
                                readonly restroom: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly smoking: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly jukebox: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly music: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly live_music: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly private_room: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly outdoor_seating: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly tvs: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly atm: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly coat_check: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly wheelchair_accessible: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly parking: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly parking: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly street_parking: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly valet_parking: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly public_lot: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly private_lot: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                    };
                                };
                                readonly sit_down_dining: {
                                    readonly type: "object";
                                    readonly additionalProperties: true;
                                };
                                readonly wifi: {
                                    readonly type: "string";
                                };
                            };
                        };
                        readonly attributes: {
                            readonly type: "object";
                            readonly properties: {
                                readonly business_meeting: {
                                    readonly type: "string";
                                };
                                readonly clean: {
                                    readonly type: "string";
                                };
                                readonly crowded: {
                                    readonly type: "string";
                                };
                                readonly dates_popular: {
                                    readonly type: "string";
                                };
                                readonly dressy: {
                                    readonly type: "string";
                                };
                                readonly families_popular: {
                                    readonly type: "string";
                                };
                                readonly gluten_free_diet: {
                                    readonly type: "string";
                                };
                                readonly good_for_dogs: {
                                    readonly type: "string";
                                };
                                readonly groups_popular: {
                                    readonly type: "string";
                                };
                                readonly healthy_diet: {
                                    readonly type: "string";
                                };
                                readonly late_night: {
                                    readonly type: "string";
                                };
                                readonly noisy: {
                                    readonly type: "string";
                                };
                                readonly quick_bite: {
                                    readonly type: "string";
                                };
                                readonly romantic: {
                                    readonly type: "string";
                                };
                                readonly service_quality: {
                                    readonly type: "string";
                                };
                                readonly singles_popular: {
                                    readonly type: "string";
                                };
                                readonly special_occasion: {
                                    readonly type: "string";
                                };
                                readonly trendy: {
                                    readonly type: "string";
                                };
                                readonly value_for_money: {
                                    readonly type: "string";
                                };
                                readonly vegan_diet: {
                                    readonly type: "string";
                                };
                                readonly vegetarian_diet: {
                                    readonly type: "string";
                                };
                            };
                        };
                    };
                };
                readonly geocodes: {
                    readonly type: "object";
                    readonly properties: {
                        readonly drop_off: {
                            readonly type: "object";
                            readonly properties: {
                                readonly latitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                                readonly longitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                            };
                        };
                        readonly front_door: {
                            readonly type: "object";
                            readonly properties: {
                                readonly latitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                                readonly longitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                            };
                        };
                        readonly main: {
                            readonly type: "object";
                            readonly properties: {
                                readonly latitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                                readonly longitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                            };
                        };
                        readonly road: {
                            readonly type: "object";
                            readonly properties: {
                                readonly latitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                                readonly longitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                            };
                        };
                        readonly roof: {
                            readonly type: "object";
                            readonly properties: {
                                readonly latitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                                readonly longitude: {
                                    readonly type: "number";
                                    readonly format: "double";
                                    readonly minimum: -1.7976931348623157e+308;
                                    readonly maximum: 1.7976931348623157e+308;
                                };
                            };
                        };
                    };
                };
                readonly hours: {
                    readonly type: "object";
                    readonly properties: {
                        readonly display: {
                            readonly type: "string";
                        };
                        readonly is_local_holiday: {
                            readonly type: "boolean";
                        };
                        readonly open_now: {
                            readonly type: "boolean";
                        };
                        readonly regular: {
                            readonly type: "array";
                            readonly properties: {
                                readonly traversable_again: {
                                    readonly type: "boolean";
                                };
                            };
                            readonly items: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly close: {
                                        readonly type: "string";
                                    };
                                    readonly day: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly open: {
                                        readonly type: "string";
                                    };
                                };
                            };
                        };
                    };
                };
                readonly hours_popular: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly close: {
                                readonly type: "string";
                            };
                            readonly day: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly open: {
                                readonly type: "string";
                            };
                        };
                    };
                };
                readonly link: {
                    readonly type: "string";
                };
                readonly location: {
                    readonly type: "object";
                    readonly properties: {
                        readonly address: {
                            readonly type: "string";
                        };
                        readonly address_extended: {
                            readonly type: "string";
                        };
                        readonly admin_region: {
                            readonly type: "string";
                        };
                        readonly census_block: {
                            readonly type: "string";
                        };
                        readonly country: {
                            readonly type: "string";
                        };
                        readonly cross_street: {
                            readonly type: "string";
                        };
                        readonly dma: {
                            readonly type: "string";
                        };
                        readonly formatted_address: {
                            readonly type: "string";
                        };
                        readonly locality: {
                            readonly type: "string";
                        };
                        readonly neighborhood: {
                            readonly type: "array";
                            readonly properties: {
                                readonly traversable_again: {
                                    readonly type: "boolean";
                                };
                            };
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly po_box: {
                            readonly type: "string";
                        };
                        readonly post_town: {
                            readonly type: "string";
                        };
                        readonly postcode: {
                            readonly type: "string";
                        };
                        readonly region: {
                            readonly type: "string";
                        };
                    };
                };
                readonly menu: {
                    readonly type: "string";
                };
                readonly name: {
                    readonly type: "string";
                };
                readonly photos: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly id: {
                                readonly type: "string";
                            };
                            readonly created_at: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly prefix: {
                                readonly type: "string";
                            };
                            readonly suffix: {
                                readonly type: "string";
                            };
                            readonly width: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly height: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly classifications: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly tip: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly id: {
                                        readonly type: "string";
                                    };
                                    readonly created_at: {
                                        readonly type: "string";
                                        readonly format: "date-time";
                                    };
                                    readonly text: {
                                        readonly type: "string";
                                    };
                                    readonly url: {
                                        readonly type: "string";
                                    };
                                    readonly photo: {};
                                    readonly lang: {
                                        readonly type: "string";
                                    };
                                    readonly agree_count: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly disagree_count: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                };
                            };
                        };
                    };
                };
                readonly popularity: {
                    readonly type: "number";
                    readonly format: "double";
                    readonly minimum: -1.7976931348623157e+308;
                    readonly maximum: 1.7976931348623157e+308;
                };
                readonly price: {
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly minimum: -2147483648;
                    readonly maximum: 2147483647;
                };
                readonly rating: {
                    readonly type: "number";
                    readonly format: "double";
                    readonly minimum: -1.7976931348623157e+308;
                    readonly maximum: 1.7976931348623157e+308;
                };
                readonly related_places: {
                    readonly type: "object";
                    readonly properties: {
                        readonly parent: {};
                    };
                };
                readonly social_media: {
                    readonly type: "object";
                    readonly properties: {
                        readonly facebook_id: {
                            readonly type: "string";
                        };
                        readonly instagram: {
                            readonly type: "string";
                        };
                        readonly twitter: {
                            readonly type: "string";
                        };
                    };
                };
                readonly stats: {
                    readonly type: "object";
                    readonly properties: {
                        readonly total_photos: {
                            readonly type: "integer";
                            readonly format: "int32";
                            readonly minimum: -2147483648;
                            readonly maximum: 2147483647;
                        };
                        readonly total_ratings: {
                            readonly type: "integer";
                            readonly format: "int64";
                            readonly minimum: -9223372036854776000;
                            readonly maximum: 9223372036854776000;
                        };
                        readonly total_tips: {
                            readonly type: "integer";
                            readonly format: "int32";
                            readonly minimum: -2147483648;
                            readonly maximum: 2147483647;
                        };
                    };
                };
                readonly store_id: {
                    readonly type: "string";
                };
                readonly tastes: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly tel: {
                    readonly type: "string";
                };
                readonly timezone: {
                    readonly type: "string";
                };
                readonly tips: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly id: {
                                readonly type: "string";
                            };
                            readonly created_at: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly text: {
                                readonly type: "string";
                            };
                            readonly url: {
                                readonly type: "string";
                            };
                            readonly photo: {};
                            readonly lang: {
                                readonly type: "string";
                            };
                            readonly agree_count: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly disagree_count: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                        };
                    };
                };
                readonly venue_reality_bucket: {
                    readonly type: "string";
                };
                readonly verified: {
                    readonly type: "boolean";
                };
                readonly website: {
                    readonly type: "string";
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
declare const PlaceFlag: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly fsq_id: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A unique string identifier for a FSQ Place (formerly known as Venue ID). E.g., Foursquare HQ's fsq_id = 5a187743ccad6b307315e6fe";
                };
            };
            readonly required: readonly ["fsq_id"];
        }, {
            readonly type: "object";
            readonly properties: {
                readonly problem: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Problem being flagged. Possible values are:<ul><li>closed</li><li>doesnt_exist</li><li>duplicate</li><li>inappropriate</li><li>incorrect_items</li><li>locationreview</li><li>mislocated</li><li>not_closed</li><li>other</li><li>private</li><li>public</li><li>suspicious_hours</li></ul>";
                };
                readonly comment: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A comment describing the issue being flagged.";
                };
                readonly ll: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Correct Lat/Long for the venue if location is being flagged.";
                };
                readonly ll_label: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Label for the venue lat long if location is being flagged.";
                };
                readonly additional_ll: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Correct Lat/Long for the venue if location is being flagged.";
                };
                readonly additional_ll_label: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Label for the venue lat long if location is being flagged.";
                };
                readonly duplicate_ids: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Venue ids to flag as duplicates of the venue.";
                };
                readonly partner_id: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The partnerID for partner provided attributes.";
                };
            };
            readonly required: readonly ["problem"];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly proposed_edits: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly id: {
                                readonly type: "string";
                            };
                            readonly fsq_id: {
                                readonly type: "string";
                            };
                            readonly proposed_edit_type: {
                                readonly type: "string";
                            };
                            readonly created_at: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly resolved_time: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly rolled_back: {
                                readonly type: "object";
                                readonly additionalProperties: true;
                            };
                            readonly status: {
                                readonly type: "string";
                            };
                        };
                    };
                };
                readonly errors: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "string";
                    };
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
declare const PlaceMatch: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly name: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Name of the place to match.";
                };
                readonly address: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Street address of the place to match (e.g. 1060 W Addison St).";
                };
                readonly city: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "City, or Locality, where the place is located (e.g. Chicago).";
                };
                readonly state: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "State, or Region, where the place is located (e.g. Illinois).";
                };
                readonly postal_code: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The postal code for the address where the place is located (e.g. 60613).";
                };
                readonly cc: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The 2-digit country code where the place is located (e.g. US).";
                };
                readonly ll: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The latitude/longitude of the venue location. This must be specified as latitude,longitude (e.g., ll=41.9484,-87.6553).";
                };
                readonly fields: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Indicate which fields to return in the response, separated by commas. If no fields are specified, all <a href=\"https://docs.foursquare.com/reference/response-fields#core-data-fields\" target=\"_blank\">Core Fields</a> are returned by default. \n\nFor a complete list of returnable fields, refer to the <a href=\"https://docs.foursquare.com/reference/response-fields\" target=\"_blank\">Response Fields</a> page.";
                };
            };
            readonly required: readonly ["name"];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly place: {
                    readonly type: "object";
                    readonly properties: {
                        readonly fsq_id: {
                            readonly type: "string";
                        };
                        readonly categories: {
                            readonly type: "array";
                            readonly properties: {
                                readonly traversable_again: {
                                    readonly type: "boolean";
                                };
                            };
                            readonly items: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly id: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly name: {
                                        readonly type: "string";
                                    };
                                    readonly short_name: {
                                        readonly type: "string";
                                    };
                                    readonly plural_name: {
                                        readonly type: "string";
                                    };
                                    readonly icon: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly id: {
                                                readonly type: "string";
                                            };
                                            readonly created_at: {
                                                readonly type: "string";
                                                readonly format: "date-time";
                                            };
                                            readonly prefix: {
                                                readonly type: "string";
                                            };
                                            readonly suffix: {
                                                readonly type: "string";
                                            };
                                            readonly width: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                            readonly height: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                            readonly classifications: {
                                                readonly type: "array";
                                                readonly properties: {
                                                    readonly traversable_again: {
                                                        readonly type: "boolean";
                                                    };
                                                };
                                                readonly items: {
                                                    readonly type: "string";
                                                };
                                            };
                                            readonly tip: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly id: {
                                                        readonly type: "string";
                                                    };
                                                    readonly created_at: {
                                                        readonly type: "string";
                                                        readonly format: "date-time";
                                                    };
                                                    readonly text: {
                                                        readonly type: "string";
                                                    };
                                                    readonly url: {
                                                        readonly type: "string";
                                                    };
                                                    readonly photo: {};
                                                    readonly lang: {
                                                        readonly type: "string";
                                                    };
                                                    readonly agree_count: {
                                                        readonly type: "integer";
                                                        readonly format: "int32";
                                                        readonly minimum: -2147483648;
                                                        readonly maximum: 2147483647;
                                                    };
                                                    readonly disagree_count: {
                                                        readonly type: "integer";
                                                        readonly format: "int32";
                                                        readonly minimum: -2147483648;
                                                        readonly maximum: 2147483647;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                        };
                        readonly chains: {
                            readonly type: "array";
                            readonly properties: {
                                readonly traversable_again: {
                                    readonly type: "boolean";
                                };
                            };
                            readonly items: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly id: {
                                        readonly type: "string";
                                    };
                                    readonly name: {
                                        readonly type: "string";
                                    };
                                };
                            };
                        };
                        readonly closed_bucket: {
                            readonly type: "string";
                        };
                        readonly date_closed: {
                            readonly type: "string";
                            readonly format: "date";
                        };
                        readonly description: {
                            readonly type: "string";
                        };
                        readonly distance: {
                            readonly type: "integer";
                            readonly format: "int32";
                            readonly minimum: -2147483648;
                            readonly maximum: 2147483647;
                        };
                        readonly email: {
                            readonly type: "string";
                        };
                        readonly fax: {
                            readonly type: "string";
                        };
                        readonly features: {
                            readonly type: "object";
                            readonly properties: {
                                readonly payment: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly credit_cards: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly accepts_credit_cards: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly amex: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly discover: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly visa: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly diners_club: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly master_card: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly union_pay: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                            };
                                        };
                                        readonly digital_wallet: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly accepts_nfc: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                            };
                                        };
                                    };
                                };
                                readonly food_and_drink: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly alcohol: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly bar_service: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly beer: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly byo: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly cocktails: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly full_bar: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly wine: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                            };
                                        };
                                        readonly meals: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly bar_snacks: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly breakfast: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly brunch: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly lunch: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly happy_hour: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly dessert: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly dinner: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly tasting_menu: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                            };
                                        };
                                    };
                                };
                                readonly services: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly delivery: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly takeout: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly drive_through: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly dine_in: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly reservations: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly online_reservations: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly groups_only_reservations: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly essential_reservations: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                            };
                                        };
                                    };
                                };
                                readonly amenities: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly restroom: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly smoking: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly jukebox: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly music: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly live_music: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly private_room: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly outdoor_seating: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly tvs: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly atm: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly coat_check: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly wheelchair_accessible: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly parking: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly parking: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly street_parking: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly valet_parking: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly public_lot: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                                readonly private_lot: {
                                                    readonly type: "object";
                                                    readonly additionalProperties: true;
                                                };
                                            };
                                        };
                                        readonly sit_down_dining: {
                                            readonly type: "object";
                                            readonly additionalProperties: true;
                                        };
                                        readonly wifi: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                                readonly attributes: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly business_meeting: {
                                            readonly type: "string";
                                        };
                                        readonly clean: {
                                            readonly type: "string";
                                        };
                                        readonly crowded: {
                                            readonly type: "string";
                                        };
                                        readonly dates_popular: {
                                            readonly type: "string";
                                        };
                                        readonly dressy: {
                                            readonly type: "string";
                                        };
                                        readonly families_popular: {
                                            readonly type: "string";
                                        };
                                        readonly gluten_free_diet: {
                                            readonly type: "string";
                                        };
                                        readonly good_for_dogs: {
                                            readonly type: "string";
                                        };
                                        readonly groups_popular: {
                                            readonly type: "string";
                                        };
                                        readonly healthy_diet: {
                                            readonly type: "string";
                                        };
                                        readonly late_night: {
                                            readonly type: "string";
                                        };
                                        readonly noisy: {
                                            readonly type: "string";
                                        };
                                        readonly quick_bite: {
                                            readonly type: "string";
                                        };
                                        readonly romantic: {
                                            readonly type: "string";
                                        };
                                        readonly service_quality: {
                                            readonly type: "string";
                                        };
                                        readonly singles_popular: {
                                            readonly type: "string";
                                        };
                                        readonly special_occasion: {
                                            readonly type: "string";
                                        };
                                        readonly trendy: {
                                            readonly type: "string";
                                        };
                                        readonly value_for_money: {
                                            readonly type: "string";
                                        };
                                        readonly vegan_diet: {
                                            readonly type: "string";
                                        };
                                        readonly vegetarian_diet: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                            };
                        };
                        readonly geocodes: {
                            readonly type: "object";
                            readonly properties: {
                                readonly drop_off: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly latitude: {
                                            readonly type: "number";
                                            readonly format: "double";
                                            readonly minimum: -1.7976931348623157e+308;
                                            readonly maximum: 1.7976931348623157e+308;
                                        };
                                        readonly longitude: {
                                            readonly type: "number";
                                            readonly format: "double";
                                            readonly minimum: -1.7976931348623157e+308;
                                            readonly maximum: 1.7976931348623157e+308;
                                        };
                                    };
                                };
                                readonly front_door: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly latitude: {
                                            readonly type: "number";
                                            readonly format: "double";
                                            readonly minimum: -1.7976931348623157e+308;
                                            readonly maximum: 1.7976931348623157e+308;
                                        };
                                        readonly longitude: {
                                            readonly type: "number";
                                            readonly format: "double";
                                            readonly minimum: -1.7976931348623157e+308;
                                            readonly maximum: 1.7976931348623157e+308;
                                        };
                                    };
                                };
                                readonly main: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly latitude: {
                                            readonly type: "number";
                                            readonly format: "double";
                                            readonly minimum: -1.7976931348623157e+308;
                                            readonly maximum: 1.7976931348623157e+308;
                                        };
                                        readonly longitude: {
                                            readonly type: "number";
                                            readonly format: "double";
                                            readonly minimum: -1.7976931348623157e+308;
                                            readonly maximum: 1.7976931348623157e+308;
                                        };
                                    };
                                };
                                readonly road: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly latitude: {
                                            readonly type: "number";
                                            readonly format: "double";
                                            readonly minimum: -1.7976931348623157e+308;
                                            readonly maximum: 1.7976931348623157e+308;
                                        };
                                        readonly longitude: {
                                            readonly type: "number";
                                            readonly format: "double";
                                            readonly minimum: -1.7976931348623157e+308;
                                            readonly maximum: 1.7976931348623157e+308;
                                        };
                                    };
                                };
                                readonly roof: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly latitude: {
                                            readonly type: "number";
                                            readonly format: "double";
                                            readonly minimum: -1.7976931348623157e+308;
                                            readonly maximum: 1.7976931348623157e+308;
                                        };
                                        readonly longitude: {
                                            readonly type: "number";
                                            readonly format: "double";
                                            readonly minimum: -1.7976931348623157e+308;
                                            readonly maximum: 1.7976931348623157e+308;
                                        };
                                    };
                                };
                            };
                        };
                        readonly hours: {
                            readonly type: "object";
                            readonly properties: {
                                readonly display: {
                                    readonly type: "string";
                                };
                                readonly is_local_holiday: {
                                    readonly type: "boolean";
                                };
                                readonly open_now: {
                                    readonly type: "boolean";
                                };
                                readonly regular: {
                                    readonly type: "array";
                                    readonly properties: {
                                        readonly traversable_again: {
                                            readonly type: "boolean";
                                        };
                                    };
                                    readonly items: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly close: {
                                                readonly type: "string";
                                            };
                                            readonly day: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                            readonly open: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                };
                            };
                        };
                        readonly hours_popular: {
                            readonly type: "array";
                            readonly properties: {
                                readonly traversable_again: {
                                    readonly type: "boolean";
                                };
                            };
                            readonly items: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly close: {
                                        readonly type: "string";
                                    };
                                    readonly day: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly open: {
                                        readonly type: "string";
                                    };
                                };
                            };
                        };
                        readonly link: {
                            readonly type: "string";
                        };
                        readonly location: {
                            readonly type: "object";
                            readonly properties: {
                                readonly address: {
                                    readonly type: "string";
                                };
                                readonly address_extended: {
                                    readonly type: "string";
                                };
                                readonly admin_region: {
                                    readonly type: "string";
                                };
                                readonly census_block: {
                                    readonly type: "string";
                                };
                                readonly country: {
                                    readonly type: "string";
                                };
                                readonly cross_street: {
                                    readonly type: "string";
                                };
                                readonly dma: {
                                    readonly type: "string";
                                };
                                readonly formatted_address: {
                                    readonly type: "string";
                                };
                                readonly locality: {
                                    readonly type: "string";
                                };
                                readonly neighborhood: {
                                    readonly type: "array";
                                    readonly properties: {
                                        readonly traversable_again: {
                                            readonly type: "boolean";
                                        };
                                    };
                                    readonly items: {
                                        readonly type: "string";
                                    };
                                };
                                readonly po_box: {
                                    readonly type: "string";
                                };
                                readonly post_town: {
                                    readonly type: "string";
                                };
                                readonly postcode: {
                                    readonly type: "string";
                                };
                                readonly region: {
                                    readonly type: "string";
                                };
                            };
                        };
                        readonly menu: {
                            readonly type: "string";
                        };
                        readonly name: {
                            readonly type: "string";
                        };
                        readonly photos: {
                            readonly type: "array";
                            readonly properties: {
                                readonly traversable_again: {
                                    readonly type: "boolean";
                                };
                            };
                            readonly items: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly id: {
                                        readonly type: "string";
                                    };
                                    readonly created_at: {
                                        readonly type: "string";
                                        readonly format: "date-time";
                                    };
                                    readonly prefix: {
                                        readonly type: "string";
                                    };
                                    readonly suffix: {
                                        readonly type: "string";
                                    };
                                    readonly width: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly height: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly classifications: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly tip: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly id: {
                                                readonly type: "string";
                                            };
                                            readonly created_at: {
                                                readonly type: "string";
                                                readonly format: "date-time";
                                            };
                                            readonly text: {
                                                readonly type: "string";
                                            };
                                            readonly url: {
                                                readonly type: "string";
                                            };
                                            readonly photo: {};
                                            readonly lang: {
                                                readonly type: "string";
                                            };
                                            readonly agree_count: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                            readonly disagree_count: {
                                                readonly type: "integer";
                                                readonly format: "int32";
                                                readonly minimum: -2147483648;
                                                readonly maximum: 2147483647;
                                            };
                                        };
                                    };
                                };
                            };
                        };
                        readonly popularity: {
                            readonly type: "number";
                            readonly format: "double";
                            readonly minimum: -1.7976931348623157e+308;
                            readonly maximum: 1.7976931348623157e+308;
                        };
                        readonly price: {
                            readonly type: "integer";
                            readonly format: "int32";
                            readonly minimum: -2147483648;
                            readonly maximum: 2147483647;
                        };
                        readonly rating: {
                            readonly type: "number";
                            readonly format: "double";
                            readonly minimum: -1.7976931348623157e+308;
                            readonly maximum: 1.7976931348623157e+308;
                        };
                        readonly related_places: {
                            readonly type: "object";
                            readonly properties: {
                                readonly parent: {};
                            };
                        };
                        readonly social_media: {
                            readonly type: "object";
                            readonly properties: {
                                readonly facebook_id: {
                                    readonly type: "string";
                                };
                                readonly instagram: {
                                    readonly type: "string";
                                };
                                readonly twitter: {
                                    readonly type: "string";
                                };
                            };
                        };
                        readonly stats: {
                            readonly type: "object";
                            readonly properties: {
                                readonly total_photos: {
                                    readonly type: "integer";
                                    readonly format: "int32";
                                    readonly minimum: -2147483648;
                                    readonly maximum: 2147483647;
                                };
                                readonly total_ratings: {
                                    readonly type: "integer";
                                    readonly format: "int64";
                                    readonly minimum: -9223372036854776000;
                                    readonly maximum: 9223372036854776000;
                                };
                                readonly total_tips: {
                                    readonly type: "integer";
                                    readonly format: "int32";
                                    readonly minimum: -2147483648;
                                    readonly maximum: 2147483647;
                                };
                            };
                        };
                        readonly store_id: {
                            readonly type: "string";
                        };
                        readonly tastes: {
                            readonly type: "array";
                            readonly properties: {
                                readonly traversable_again: {
                                    readonly type: "boolean";
                                };
                            };
                            readonly items: {
                                readonly type: "string";
                            };
                        };
                        readonly tel: {
                            readonly type: "string";
                        };
                        readonly timezone: {
                            readonly type: "string";
                        };
                        readonly tips: {
                            readonly type: "array";
                            readonly properties: {
                                readonly traversable_again: {
                                    readonly type: "boolean";
                                };
                            };
                            readonly items: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly id: {
                                        readonly type: "string";
                                    };
                                    readonly created_at: {
                                        readonly type: "string";
                                        readonly format: "date-time";
                                    };
                                    readonly text: {
                                        readonly type: "string";
                                    };
                                    readonly url: {
                                        readonly type: "string";
                                    };
                                    readonly photo: {};
                                    readonly lang: {
                                        readonly type: "string";
                                    };
                                    readonly agree_count: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly disagree_count: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                };
                            };
                        };
                        readonly venue_reality_bucket: {
                            readonly type: "string";
                        };
                        readonly verified: {
                            readonly type: "boolean";
                        };
                        readonly website: {
                            readonly type: "string";
                        };
                    };
                };
                readonly match_score: {
                    readonly type: "number";
                    readonly format: "double";
                    readonly minimum: -1.7976931348623157e+308;
                    readonly maximum: 1.7976931348623157e+308;
                };
                readonly context: {
                    readonly type: "object";
                    readonly properties: {
                        readonly latitude: {
                            readonly type: "number";
                            readonly format: "double";
                            readonly minimum: -1.7976931348623157e+308;
                            readonly maximum: 1.7976931348623157e+308;
                        };
                        readonly longitude: {
                            readonly type: "number";
                            readonly format: "double";
                            readonly minimum: -1.7976931348623157e+308;
                            readonly maximum: 1.7976931348623157e+308;
                        };
                    };
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
declare const PlacePhotos: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly fsq_id: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A unique string identifier for a FSQ Place (formerly known as Venue ID). E.g., Foursquare HQ's fsq_id = 5a187743ccad6b307315e6fe";
                };
            };
            readonly required: readonly ["fsq_id"];
        }, {
            readonly type: "object";
            readonly properties: {
                readonly limit: {
                    readonly maximum: 50;
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly minimum: -2147483648;
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The specified number of photos per page. Returns 10 photos by default, up to a maximum number of 50.";
                };
                readonly sort: {
                    readonly type: "string";
                    readonly enum: readonly ["POPULAR", "NEWEST"];
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Specifies the order in which results are listed. Possible values are:<ul><li>popular (default) - sorts results based on their popularity among Foursquare users</li><li>newest - sorts results from most recently added to least recently added</li></ul>";
                };
                readonly classifications: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Restricts the results to photos matching the specified classifications, separated by a comma. Possible values are:<ul><li>food - photos of food</li><li>indoor - photos of indoors</li><li>menu - photos of menus</li><li>outdoor - photos of storefronts, outdoors, and exteriors</li></ul>";
                };
            };
            readonly required: readonly [];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly created_at: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                    readonly prefix: {
                        readonly type: "string";
                    };
                    readonly suffix: {
                        readonly type: "string";
                    };
                    readonly width: {
                        readonly type: "integer";
                        readonly format: "int32";
                        readonly minimum: -2147483648;
                        readonly maximum: 2147483647;
                    };
                    readonly height: {
                        readonly type: "integer";
                        readonly format: "int32";
                        readonly minimum: -2147483648;
                        readonly maximum: 2147483647;
                    };
                    readonly classifications: {
                        readonly type: "array";
                        readonly properties: {
                            readonly traversable_again: {
                                readonly type: "boolean";
                            };
                        };
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly tip: {
                        readonly type: "object";
                        readonly properties: {
                            readonly id: {
                                readonly type: "string";
                            };
                            readonly created_at: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly text: {
                                readonly type: "string";
                            };
                            readonly url: {
                                readonly type: "string";
                            };
                            readonly photo: {};
                            readonly lang: {
                                readonly type: "string";
                            };
                            readonly agree_count: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly disagree_count: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                        };
                    };
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
declare const PlaceProposeEdit: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly fsq_id: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A unique string identifier for a FSQ Place (formerly known as Venue ID). E.g., Foursquare HQ's fsq_id = 5a187743ccad6b307315e6fe";
                };
            };
            readonly required: readonly ["fsq_id"];
        }, {
            readonly type: "object";
            readonly properties: {
                readonly ll: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the latitude and longitude at which the place should be located (e.g., ll=41.8781,-87.6298)";
                };
                readonly menu_url: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the url where the menu of the place can be found.";
                };
                readonly facebook_url: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the  url for this place's Facebook Page.";
                };
                readonly parent_id: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value if the place is a subvenue of a larger place (such as a coffee shop within a Target), set this attribute to the ID of the parent place. Set to \"\" to remove parent.";
                };
                readonly hours: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the hours for the venue, as a semi-colon separated list of open segments and named segments (e.g., brunch or happy hour). Open segments are formatted as day,start,end. Named segments additionally have a label, formatted as day,start,end,label. Days are formatted as integers with Monday = 1,...,Sunday = 7. Start and End are formatted as [+]HHMM format. Use 24 hour format (no colon), prefix with 0 for HH or MM less than 10. Use '+' prefix, i.e., +0230 to represent 2:30 am past midnight into the following day. To indicate that a venue is open 24/7, send this value with the hours attribute: 1,0000,2400;2,0000,2400;3,0000,2400;4,0000,2400;5,0000,2400;6,0000,2400;7,0000,2400";
                };
                readonly name: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the  name of the place.";
                };
                readonly description: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the freeform description of the place, up to 300 characters.";
                };
                readonly phone: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the  phone number of the place.";
                };
                readonly twitter: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the  twitter handle of the place.";
                };
                readonly url: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the  url of the homepage of the place.";
                };
                readonly address: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the  address of the place.";
                };
                readonly cross_street: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the  nearest intersecting street or streets.";
                };
                readonly locality: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the  name of the locality (city) where this place is.";
                };
                readonly region: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the  nearest state or province to the place.";
                };
                readonly postcode: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The proposed new value for the  zip or postal code for the place.";
                };
                readonly add_categories: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Add category IDs. Supports multiple Category IDs, separated by commas.\n\nFor a complete list of Foursquare Category IDs, refer to the <a href=\"https://docs.foursquare.com/docs/categories\" target=\"blank\">Category Taxonomy</a> page. [This endpoint prefers the 5-integer style id, but can accept theBSON style id]";
                };
                readonly remove_categories: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Remove category IDs. Supports multiple Category IDs, separated by commas.\n\nFor a complete list of Foursquare Category IDs, refer to the <a href=\"https://docs.foursquare.com/docs/categories\" target=\"blank\">Category Taxonomy</a> page. [This endpoint prefers the 5-integer style id, but can accept theBSON style id]";
                };
                readonly primary_category: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Change the primary category ID\n\nFor a complete list of Foursquare Category IDs, refer to the <a href=\"https://docs.foursquare.com/docs/categories\" target=\"blank\">Category Taxonomy</a> page. [This endpoint prefers the 5-integer style id, but can accept theBSON style id]";
                };
                readonly add_chains: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Add chain IDs";
                };
                readonly remove_chains: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Remove chain IDs";
                };
                readonly primary_chain: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Change the p chain ID";
                };
            };
            readonly required: readonly [];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly proposed_edits: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly id: {
                                readonly type: "string";
                            };
                            readonly fsq_id: {
                                readonly type: "string";
                            };
                            readonly proposed_edit_type: {
                                readonly type: "string";
                            };
                            readonly created_at: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly resolved_time: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly rolled_back: {
                                readonly type: "object";
                                readonly additionalProperties: true;
                            };
                            readonly status: {
                                readonly type: "string";
                            };
                        };
                    };
                };
                readonly errors: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "string";
                    };
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
declare const PlaceSearch: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly query: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A string to be matched against all content for this place, including but not limited to venue name, category, telephone number, taste, and tips.";
                };
                readonly ll: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The latitude/longitude around which to retrieve place information. This must be specified as latitude,longitude (e.g., ll=41.8781,-87.6298).";
                };
                readonly radius: {
                    readonly maximum: 100000;
                    readonly minimum: 0;
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Sets a radius distance (in meters) used to define an area to bias search results. The maximum allowed radius is 100,000 meters. Radius can be used in combination with ll or ip biased geolocation only. By using radius, global search results will be omitted. If not provided, default radius applied is 22000 meters.";
                };
                readonly categories: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Filters the response and returns FSQ Places matching the specified categories. Supports multiple Category IDs, separated by commas.\n\nFor a complete list of Foursquare Category IDs, refer to the <a href=\"https://docs.foursquare.com/docs/categories\" target=\"blank\">Category Taxonomy</a> page. [This endpoint prefers the 5-integer style id, but can accept theBSON style id]";
                };
                readonly chains: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Filters the response and returns FSQ Places matching the specified chains. Supports multiple chain IDs, separated by commas.\n\nFor more information on Foursquare Chain IDs, refer to the <a href=\"https://docs.foursquare.com/docs/chains\" target=\"blank\">Chains</a> page.";
                };
                readonly exclude_chains: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Filters the response and returns FSQ Places not matching any of the specified chains. Supports multiple chain IDs, separated by commas. Cannot be used in conjunction with exclude_all_chains.\n\nFor more information on Foursquare Chain IDs, refer to the <a href=\"https://docs.foursquare.com/docs/chains\" target=\"blank\">Chains</a> page.";
                };
                readonly exclude_all_chains: {
                    readonly type: "boolean";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Filters the response by only returning FSQ Places that are not known to be part of any chain. Cannot be used in conjunction with exclude_chains.";
                };
                readonly fields: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Indicate which fields to return in the response, separated by commas. If no fields are specified, all <a href=\"https://docs.foursquare.com/reference/response-fields#core-data-fields\" target=\"_blank\">Core Fields</a> are returned by default. \n\nFor a complete list of returnable fields, refer to the <a href=\"https://docs.foursquare.com/reference/response-fields\" target=\"_blank\">Response Fields</a> page.";
                };
                readonly min_price: {
                    readonly maximum: 4;
                    readonly minimum: 1;
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Restricts results to only those places within the specified price range. Valid values range between 1 (most affordable) to 4 (most expensive), inclusive.";
                };
                readonly max_price: {
                    readonly maximum: 4;
                    readonly minimum: 1;
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Restricts results to only those places within the specified price range. Valid values range between 1 (most affordable) to 4 (most expensive), inclusive.";
                };
                readonly open_at: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Support local day and local time requests through this parameter. To be specified as DOWTHHMM (e.g., 1T2130), where DOW is the day number 1-7 (Monday = 1, Sunday = 7) and time is in 24 hour format.\n\nPlaces that do not have opening hours will not be returned if this parameter is specified. Cannot be specified in conjunction with `open_now`.";
                };
                readonly open_now: {
                    readonly type: "boolean";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Restricts results to only those places that are open now.\n\nPlaces that do not have opening hours will not be returned if this parameter is specified. Cannot be specified in conjunction with `open_at`.";
                };
                readonly ne: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The latitude/longitude representing the north/east points of a rectangle. Must be used with sw parameter to specify a rectangular search box. Global search results will be omitted.";
                };
                readonly sw: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The latitude/longitude representing the south/west points of a rectangle. Must be used with ne parameter to specify a rectangular search box. Global search results will be omitted.";
                };
                readonly near: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A string naming a locality in the world (e.g., \"Chicago, IL\"). If the value is not geocodable, returns an error.";
                };
                readonly polygon: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A string containing a list of coordinate pairs which define the edges of the polygon. Each pair must include latitude and longitude separated by a comma, with each pair separated by a tilde ~. Must have at least 4 coordinate pairs and be considered a \"closed\" polygon.";
                };
                readonly sort: {
                    readonly type: "string";
                    readonly enum: readonly ["RELEVANCE", "RATING", "DISTANCE", "POPULARITY"];
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Specifies the order in which results are listed. Possible values are:<ul><li>relevance (default)</li><li>rating</li><li>distance</li></ul>";
                };
                readonly limit: {
                    readonly maximum: 50;
                    readonly minimum: 1;
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The number of results to return, up to 50. Defaults to 10.";
                };
                readonly session_token: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A user-generated token to identify a session for billing purposes. Learn more about [session tokens](https://docs.foursquare.com/reference/session-tokens).";
                };
                readonly super_venue_id: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A Foursquare Venue ID to use as search bounds so only places within that venue are returned";
                };
            };
            readonly required: readonly [];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly results: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly fsq_id: {
                                readonly type: "string";
                            };
                            readonly categories: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly name: {
                                            readonly type: "string";
                                        };
                                        readonly short_name: {
                                            readonly type: "string";
                                        };
                                        readonly plural_name: {
                                            readonly type: "string";
                                        };
                                        readonly icon: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly id: {
                                                    readonly type: "string";
                                                };
                                                readonly created_at: {
                                                    readonly type: "string";
                                                    readonly format: "date-time";
                                                };
                                                readonly prefix: {
                                                    readonly type: "string";
                                                };
                                                readonly suffix: {
                                                    readonly type: "string";
                                                };
                                                readonly width: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly height: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly classifications: {
                                                    readonly type: "array";
                                                    readonly properties: {
                                                        readonly traversable_again: {
                                                            readonly type: "boolean";
                                                        };
                                                    };
                                                    readonly items: {
                                                        readonly type: "string";
                                                    };
                                                };
                                                readonly tip: {
                                                    readonly type: "object";
                                                    readonly properties: {
                                                        readonly id: {
                                                            readonly type: "string";
                                                        };
                                                        readonly created_at: {
                                                            readonly type: "string";
                                                            readonly format: "date-time";
                                                        };
                                                        readonly text: {
                                                            readonly type: "string";
                                                        };
                                                        readonly url: {
                                                            readonly type: "string";
                                                        };
                                                        readonly photo: {};
                                                        readonly lang: {
                                                            readonly type: "string";
                                                        };
                                                        readonly agree_count: {
                                                            readonly type: "integer";
                                                            readonly format: "int32";
                                                            readonly minimum: -2147483648;
                                                            readonly maximum: 2147483647;
                                                        };
                                                        readonly disagree_count: {
                                                            readonly type: "integer";
                                                            readonly format: "int32";
                                                            readonly minimum: -2147483648;
                                                            readonly maximum: 2147483647;
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly chains: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "string";
                                        };
                                        readonly name: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                            };
                            readonly closed_bucket: {
                                readonly type: "string";
                            };
                            readonly date_closed: {
                                readonly type: "string";
                                readonly format: "date";
                            };
                            readonly description: {
                                readonly type: "string";
                            };
                            readonly distance: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly email: {
                                readonly type: "string";
                            };
                            readonly fax: {
                                readonly type: "string";
                            };
                            readonly features: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly payment: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly credit_cards: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly accepts_credit_cards: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly amex: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly discover: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly visa: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly diners_club: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly master_card: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly union_pay: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                            readonly digital_wallet: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly accepts_nfc: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly food_and_drink: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly alcohol: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly bar_service: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly beer: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly byo: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly cocktails: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly full_bar: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly wine: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                            readonly meals: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly bar_snacks: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly breakfast: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly brunch: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly lunch: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly happy_hour: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly dessert: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly dinner: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly tasting_menu: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly services: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly delivery: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly takeout: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly drive_through: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly dine_in: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly online_reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly groups_only_reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly essential_reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly amenities: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly restroom: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly smoking: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly jukebox: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly music: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly live_music: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly private_room: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly outdoor_seating: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly tvs: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly atm: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly coat_check: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly wheelchair_accessible: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly parking: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly parking: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly street_parking: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly valet_parking: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly public_lot: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly private_lot: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                            readonly sit_down_dining: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly wifi: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                    readonly attributes: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly business_meeting: {
                                                readonly type: "string";
                                            };
                                            readonly clean: {
                                                readonly type: "string";
                                            };
                                            readonly crowded: {
                                                readonly type: "string";
                                            };
                                            readonly dates_popular: {
                                                readonly type: "string";
                                            };
                                            readonly dressy: {
                                                readonly type: "string";
                                            };
                                            readonly families_popular: {
                                                readonly type: "string";
                                            };
                                            readonly gluten_free_diet: {
                                                readonly type: "string";
                                            };
                                            readonly good_for_dogs: {
                                                readonly type: "string";
                                            };
                                            readonly groups_popular: {
                                                readonly type: "string";
                                            };
                                            readonly healthy_diet: {
                                                readonly type: "string";
                                            };
                                            readonly late_night: {
                                                readonly type: "string";
                                            };
                                            readonly noisy: {
                                                readonly type: "string";
                                            };
                                            readonly quick_bite: {
                                                readonly type: "string";
                                            };
                                            readonly romantic: {
                                                readonly type: "string";
                                            };
                                            readonly service_quality: {
                                                readonly type: "string";
                                            };
                                            readonly singles_popular: {
                                                readonly type: "string";
                                            };
                                            readonly special_occasion: {
                                                readonly type: "string";
                                            };
                                            readonly trendy: {
                                                readonly type: "string";
                                            };
                                            readonly value_for_money: {
                                                readonly type: "string";
                                            };
                                            readonly vegan_diet: {
                                                readonly type: "string";
                                            };
                                            readonly vegetarian_diet: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                };
                            };
                            readonly geocodes: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly drop_off: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly front_door: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly main: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly road: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly roof: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                };
                            };
                            readonly hours: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly display: {
                                        readonly type: "string";
                                    };
                                    readonly is_local_holiday: {
                                        readonly type: "boolean";
                                    };
                                    readonly open_now: {
                                        readonly type: "boolean";
                                    };
                                    readonly regular: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly close: {
                                                    readonly type: "string";
                                                };
                                                readonly day: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly open: {
                                                    readonly type: "string";
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly hours_popular: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly close: {
                                            readonly type: "string";
                                        };
                                        readonly day: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly open: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                            };
                            readonly link: {
                                readonly type: "string";
                            };
                            readonly location: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly address: {
                                        readonly type: "string";
                                    };
                                    readonly address_extended: {
                                        readonly type: "string";
                                    };
                                    readonly admin_region: {
                                        readonly type: "string";
                                    };
                                    readonly census_block: {
                                        readonly type: "string";
                                    };
                                    readonly country: {
                                        readonly type: "string";
                                    };
                                    readonly cross_street: {
                                        readonly type: "string";
                                    };
                                    readonly dma: {
                                        readonly type: "string";
                                    };
                                    readonly formatted_address: {
                                        readonly type: "string";
                                    };
                                    readonly locality: {
                                        readonly type: "string";
                                    };
                                    readonly neighborhood: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly po_box: {
                                        readonly type: "string";
                                    };
                                    readonly post_town: {
                                        readonly type: "string";
                                    };
                                    readonly postcode: {
                                        readonly type: "string";
                                    };
                                    readonly region: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly menu: {
                                readonly type: "string";
                            };
                            readonly name: {
                                readonly type: "string";
                            };
                            readonly photos: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "string";
                                        };
                                        readonly created_at: {
                                            readonly type: "string";
                                            readonly format: "date-time";
                                        };
                                        readonly prefix: {
                                            readonly type: "string";
                                        };
                                        readonly suffix: {
                                            readonly type: "string";
                                        };
                                        readonly width: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly height: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly classifications: {
                                            readonly type: "array";
                                            readonly properties: {
                                                readonly traversable_again: {
                                                    readonly type: "boolean";
                                                };
                                            };
                                            readonly items: {
                                                readonly type: "string";
                                            };
                                        };
                                        readonly tip: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly id: {
                                                    readonly type: "string";
                                                };
                                                readonly created_at: {
                                                    readonly type: "string";
                                                    readonly format: "date-time";
                                                };
                                                readonly text: {
                                                    readonly type: "string";
                                                };
                                                readonly url: {
                                                    readonly type: "string";
                                                };
                                                readonly photo: {};
                                                readonly lang: {
                                                    readonly type: "string";
                                                };
                                                readonly agree_count: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly disagree_count: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly popularity: {
                                readonly type: "number";
                                readonly format: "double";
                                readonly minimum: -1.7976931348623157e+308;
                                readonly maximum: 1.7976931348623157e+308;
                            };
                            readonly price: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly rating: {
                                readonly type: "number";
                                readonly format: "double";
                                readonly minimum: -1.7976931348623157e+308;
                                readonly maximum: 1.7976931348623157e+308;
                            };
                            readonly related_places: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly parent: {};
                                };
                            };
                            readonly social_media: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly facebook_id: {
                                        readonly type: "string";
                                    };
                                    readonly instagram: {
                                        readonly type: "string";
                                    };
                                    readonly twitter: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly stats: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly total_photos: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly total_ratings: {
                                        readonly type: "integer";
                                        readonly format: "int64";
                                        readonly minimum: -9223372036854776000;
                                        readonly maximum: 9223372036854776000;
                                    };
                                    readonly total_tips: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                };
                            };
                            readonly store_id: {
                                readonly type: "string";
                            };
                            readonly tastes: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly tel: {
                                readonly type: "string";
                            };
                            readonly timezone: {
                                readonly type: "string";
                            };
                            readonly tips: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "string";
                                        };
                                        readonly created_at: {
                                            readonly type: "string";
                                            readonly format: "date-time";
                                        };
                                        readonly text: {
                                            readonly type: "string";
                                        };
                                        readonly url: {
                                            readonly type: "string";
                                        };
                                        readonly photo: {};
                                        readonly lang: {
                                            readonly type: "string";
                                        };
                                        readonly agree_count: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly disagree_count: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                    };
                                };
                            };
                            readonly venue_reality_bucket: {
                                readonly type: "string";
                            };
                            readonly verified: {
                                readonly type: "boolean";
                            };
                            readonly website: {
                                readonly type: "string";
                            };
                        };
                    };
                };
                readonly context: {
                    readonly type: "object";
                    readonly properties: {
                        readonly geo_bounds: {
                            readonly type: "object";
                            readonly properties: {
                                readonly circle: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly center: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly latitude: {
                                                    readonly type: "number";
                                                    readonly format: "double";
                                                    readonly minimum: -1.7976931348623157e+308;
                                                    readonly maximum: 1.7976931348623157e+308;
                                                };
                                                readonly longitude: {
                                                    readonly type: "number";
                                                    readonly format: "double";
                                                    readonly minimum: -1.7976931348623157e+308;
                                                    readonly maximum: 1.7976931348623157e+308;
                                                };
                                            };
                                        };
                                        readonly radius: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
declare const PlaceSelect: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly request_id: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The request ID pulled from the header of the /v3/places/nearby request that generated the list of places to show the user";
                };
                readonly fsq_id: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The place ID of the place which was selected by the user in the UI";
                };
                readonly select_context: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Specify the use case for specified request";
                };
                readonly delayed: {
                    readonly type: "boolean";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                };
            };
            readonly required: readonly [];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly response: {
                    readonly type: "string";
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
declare const PlaceTips: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly fsq_id: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A unique string identifier for a FSQ Place (formerly known as Venue ID). E.g., Foursquare HQ's fsq_id = 5a187743ccad6b307315e6fe";
                };
            };
            readonly required: readonly ["fsq_id"];
        }, {
            readonly type: "object";
            readonly properties: {
                readonly limit: {
                    readonly maximum: 50;
                    readonly minimum: 1;
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The specified number of tips per page. Returns 10 tips by default, up to a maximum number of 50.";
                };
                readonly fields: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Indicate which fields to return in the response, separated by commas. Supported fields are:<ul><li> id - The ID of the tip to be returned.</li><li> created_at - The timestamp indicating when the tip was created; UNIX timestamp in seconds since Epoch.</li><li> text - The text of the returned tip.</li><li> lang - The language of the returned tip.</li><li> url - The URL associated with the returned tip.</li><li> agree_count - The count of users who have agreed with the returned tip.</li><li> disagree_count - The count of users who have disagreed with the returned tip.</li><li> photo - The ID of the photo asociated with the returned tip.</li></ul>Default fields if this param is omitted are \"id\", \"created_at\", and \"text\".";
                };
                readonly sort: {
                    readonly type: "string";
                    readonly enum: readonly ["POPULAR", "NEWEST"];
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Specifies the order in which results are listed. Possible values are:<ul><li>popular (default) - sorts results based on their popularity among Foursquare users</li><li>newest - sorts results from most recently added to least recently added</li></ul>";
                };
            };
            readonly required: readonly [];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "string";
                    };
                    readonly created_at: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                    readonly text: {
                        readonly type: "string";
                    };
                    readonly url: {
                        readonly type: "string";
                    };
                    readonly photo: {
                        readonly type: "object";
                        readonly properties: {
                            readonly id: {
                                readonly type: "string";
                            };
                            readonly created_at: {
                                readonly type: "string";
                                readonly format: "date-time";
                            };
                            readonly prefix: {
                                readonly type: "string";
                            };
                            readonly suffix: {
                                readonly type: "string";
                            };
                            readonly width: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly height: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly classifications: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly tip: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly id: {
                                        readonly type: "string";
                                    };
                                    readonly created_at: {
                                        readonly type: "string";
                                        readonly format: "date-time";
                                    };
                                    readonly text: {
                                        readonly type: "string";
                                    };
                                    readonly url: {
                                        readonly type: "string";
                                    };
                                    readonly photo: {};
                                    readonly lang: {
                                        readonly type: "string";
                                    };
                                    readonly agree_count: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly disagree_count: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                };
                            };
                        };
                    };
                    readonly lang: {
                        readonly type: "string";
                    };
                    readonly agree_count: {
                        readonly type: "integer";
                        readonly format: "int32";
                        readonly minimum: -2147483648;
                        readonly maximum: 2147483647;
                    };
                    readonly disagree_count: {
                        readonly type: "integer";
                        readonly format: "int32";
                        readonly minimum: -2147483648;
                        readonly maximum: 2147483647;
                    };
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
declare const PlacesNearby: {
    readonly metadata: {
        readonly allOf: readonly [{
            readonly type: "object";
            readonly properties: {
                readonly fields: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "Indicate which fields to return in the response, separated by commas. If no fields are specified, all <a href=\"https://docs.foursquare.com/reference/response-fields#core-data-fields\" target=\"_blank\">Core Fields</a> are returned by default. \n\nFor a complete list of returnable fields, refer to the <a href=\"https://docs.foursquare.com/reference/response-fields\" target=\"_blank\">Response Fields</a> page.";
                };
                readonly ll: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The latitude/longitude around which to retrieve place information. This must be specified as latitude,longitude (e.g., ll=41.8781,-87.6298). If you do not specify ll, the server will attempt to retrieve the IP address from the request, and geolocate that IP address.";
                };
                readonly hacc: {
                    readonly type: "number";
                    readonly format: "double";
                    readonly minimum: -1.7976931348623157e+308;
                    readonly maximum: 1.7976931348623157e+308;
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The estimated horizontal accuracy radius in meters of the user’s location at the 68th percentile confidence level as returned by the user’s cell phone OS.";
                };
                readonly altitude: {
                    readonly type: "number";
                    readonly format: "double";
                    readonly minimum: -1.7976931348623157e+308;
                    readonly maximum: 1.7976931348623157e+308;
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The altitude of the user’s location in meters above the World Geodetic System 1984 (WGS84) reference ellipsoid as returned by the user’s cell phone OS.";
                };
                readonly query: {
                    readonly type: "string";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "A string to be matched against venue name for this place.";
                };
                readonly limit: {
                    readonly maximum: 50;
                    readonly minimum: 1;
                    readonly type: "integer";
                    readonly format: "int32";
                    readonly $schema: "http://json-schema.org/draft-04/schema#";
                    readonly description: "The number of results to return, up to 50. Defaults to 10.";
                };
            };
            readonly required: readonly [];
        }];
    };
    readonly response: {
        readonly "200": {
            readonly type: "object";
            readonly properties: {
                readonly results: {
                    readonly type: "array";
                    readonly properties: {
                        readonly traversable_again: {
                            readonly type: "boolean";
                        };
                    };
                    readonly items: {
                        readonly type: "object";
                        readonly properties: {
                            readonly fsq_id: {
                                readonly type: "string";
                            };
                            readonly categories: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly name: {
                                            readonly type: "string";
                                        };
                                        readonly short_name: {
                                            readonly type: "string";
                                        };
                                        readonly plural_name: {
                                            readonly type: "string";
                                        };
                                        readonly icon: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly id: {
                                                    readonly type: "string";
                                                };
                                                readonly created_at: {
                                                    readonly type: "string";
                                                    readonly format: "date-time";
                                                };
                                                readonly prefix: {
                                                    readonly type: "string";
                                                };
                                                readonly suffix: {
                                                    readonly type: "string";
                                                };
                                                readonly width: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly height: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly classifications: {
                                                    readonly type: "array";
                                                    readonly properties: {
                                                        readonly traversable_again: {
                                                            readonly type: "boolean";
                                                        };
                                                    };
                                                    readonly items: {
                                                        readonly type: "string";
                                                    };
                                                };
                                                readonly tip: {
                                                    readonly type: "object";
                                                    readonly properties: {
                                                        readonly id: {
                                                            readonly type: "string";
                                                        };
                                                        readonly created_at: {
                                                            readonly type: "string";
                                                            readonly format: "date-time";
                                                        };
                                                        readonly text: {
                                                            readonly type: "string";
                                                        };
                                                        readonly url: {
                                                            readonly type: "string";
                                                        };
                                                        readonly photo: {};
                                                        readonly lang: {
                                                            readonly type: "string";
                                                        };
                                                        readonly agree_count: {
                                                            readonly type: "integer";
                                                            readonly format: "int32";
                                                            readonly minimum: -2147483648;
                                                            readonly maximum: 2147483647;
                                                        };
                                                        readonly disagree_count: {
                                                            readonly type: "integer";
                                                            readonly format: "int32";
                                                            readonly minimum: -2147483648;
                                                            readonly maximum: 2147483647;
                                                        };
                                                    };
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly chains: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "string";
                                        };
                                        readonly name: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                            };
                            readonly closed_bucket: {
                                readonly type: "string";
                            };
                            readonly date_closed: {
                                readonly type: "string";
                                readonly format: "date";
                            };
                            readonly description: {
                                readonly type: "string";
                            };
                            readonly distance: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly email: {
                                readonly type: "string";
                            };
                            readonly fax: {
                                readonly type: "string";
                            };
                            readonly features: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly payment: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly credit_cards: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly accepts_credit_cards: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly amex: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly discover: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly visa: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly diners_club: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly master_card: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly union_pay: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                            readonly digital_wallet: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly accepts_nfc: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly food_and_drink: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly alcohol: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly bar_service: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly beer: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly byo: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly cocktails: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly full_bar: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly wine: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                            readonly meals: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly bar_snacks: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly breakfast: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly brunch: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly lunch: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly happy_hour: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly dessert: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly dinner: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly tasting_menu: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly services: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly delivery: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly takeout: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly drive_through: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly dine_in: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly online_reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly groups_only_reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly essential_reservations: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                        };
                                    };
                                    readonly amenities: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly restroom: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly smoking: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly jukebox: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly music: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly live_music: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly private_room: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly outdoor_seating: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly tvs: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly atm: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly coat_check: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly wheelchair_accessible: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly parking: {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly parking: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly street_parking: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly valet_parking: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly public_lot: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                    readonly private_lot: {
                                                        readonly type: "object";
                                                        readonly additionalProperties: true;
                                                    };
                                                };
                                            };
                                            readonly sit_down_dining: {
                                                readonly type: "object";
                                                readonly additionalProperties: true;
                                            };
                                            readonly wifi: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                    readonly attributes: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly business_meeting: {
                                                readonly type: "string";
                                            };
                                            readonly clean: {
                                                readonly type: "string";
                                            };
                                            readonly crowded: {
                                                readonly type: "string";
                                            };
                                            readonly dates_popular: {
                                                readonly type: "string";
                                            };
                                            readonly dressy: {
                                                readonly type: "string";
                                            };
                                            readonly families_popular: {
                                                readonly type: "string";
                                            };
                                            readonly gluten_free_diet: {
                                                readonly type: "string";
                                            };
                                            readonly good_for_dogs: {
                                                readonly type: "string";
                                            };
                                            readonly groups_popular: {
                                                readonly type: "string";
                                            };
                                            readonly healthy_diet: {
                                                readonly type: "string";
                                            };
                                            readonly late_night: {
                                                readonly type: "string";
                                            };
                                            readonly noisy: {
                                                readonly type: "string";
                                            };
                                            readonly quick_bite: {
                                                readonly type: "string";
                                            };
                                            readonly romantic: {
                                                readonly type: "string";
                                            };
                                            readonly service_quality: {
                                                readonly type: "string";
                                            };
                                            readonly singles_popular: {
                                                readonly type: "string";
                                            };
                                            readonly special_occasion: {
                                                readonly type: "string";
                                            };
                                            readonly trendy: {
                                                readonly type: "string";
                                            };
                                            readonly value_for_money: {
                                                readonly type: "string";
                                            };
                                            readonly vegan_diet: {
                                                readonly type: "string";
                                            };
                                            readonly vegetarian_diet: {
                                                readonly type: "string";
                                            };
                                        };
                                    };
                                };
                            };
                            readonly geocodes: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly drop_off: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly front_door: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly main: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly road: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                    readonly roof: {
                                        readonly type: "object";
                                        readonly properties: {
                                            readonly latitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                            readonly longitude: {
                                                readonly type: "number";
                                                readonly format: "double";
                                                readonly minimum: -1.7976931348623157e+308;
                                                readonly maximum: 1.7976931348623157e+308;
                                            };
                                        };
                                    };
                                };
                            };
                            readonly hours: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly display: {
                                        readonly type: "string";
                                    };
                                    readonly is_local_holiday: {
                                        readonly type: "boolean";
                                    };
                                    readonly open_now: {
                                        readonly type: "boolean";
                                    };
                                    readonly regular: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly close: {
                                                    readonly type: "string";
                                                };
                                                readonly day: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly open: {
                                                    readonly type: "string";
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly hours_popular: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly close: {
                                            readonly type: "string";
                                        };
                                        readonly day: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly open: {
                                            readonly type: "string";
                                        };
                                    };
                                };
                            };
                            readonly link: {
                                readonly type: "string";
                            };
                            readonly location: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly address: {
                                        readonly type: "string";
                                    };
                                    readonly address_extended: {
                                        readonly type: "string";
                                    };
                                    readonly admin_region: {
                                        readonly type: "string";
                                    };
                                    readonly census_block: {
                                        readonly type: "string";
                                    };
                                    readonly country: {
                                        readonly type: "string";
                                    };
                                    readonly cross_street: {
                                        readonly type: "string";
                                    };
                                    readonly dma: {
                                        readonly type: "string";
                                    };
                                    readonly formatted_address: {
                                        readonly type: "string";
                                    };
                                    readonly locality: {
                                        readonly type: "string";
                                    };
                                    readonly neighborhood: {
                                        readonly type: "array";
                                        readonly properties: {
                                            readonly traversable_again: {
                                                readonly type: "boolean";
                                            };
                                        };
                                        readonly items: {
                                            readonly type: "string";
                                        };
                                    };
                                    readonly po_box: {
                                        readonly type: "string";
                                    };
                                    readonly post_town: {
                                        readonly type: "string";
                                    };
                                    readonly postcode: {
                                        readonly type: "string";
                                    };
                                    readonly region: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly menu: {
                                readonly type: "string";
                            };
                            readonly name: {
                                readonly type: "string";
                            };
                            readonly photos: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "string";
                                        };
                                        readonly created_at: {
                                            readonly type: "string";
                                            readonly format: "date-time";
                                        };
                                        readonly prefix: {
                                            readonly type: "string";
                                        };
                                        readonly suffix: {
                                            readonly type: "string";
                                        };
                                        readonly width: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly height: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly classifications: {
                                            readonly type: "array";
                                            readonly properties: {
                                                readonly traversable_again: {
                                                    readonly type: "boolean";
                                                };
                                            };
                                            readonly items: {
                                                readonly type: "string";
                                            };
                                        };
                                        readonly tip: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly id: {
                                                    readonly type: "string";
                                                };
                                                readonly created_at: {
                                                    readonly type: "string";
                                                    readonly format: "date-time";
                                                };
                                                readonly text: {
                                                    readonly type: "string";
                                                };
                                                readonly url: {
                                                    readonly type: "string";
                                                };
                                                readonly photo: {};
                                                readonly lang: {
                                                    readonly type: "string";
                                                };
                                                readonly agree_count: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                                readonly disagree_count: {
                                                    readonly type: "integer";
                                                    readonly format: "int32";
                                                    readonly minimum: -2147483648;
                                                    readonly maximum: 2147483647;
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                            readonly popularity: {
                                readonly type: "number";
                                readonly format: "double";
                                readonly minimum: -1.7976931348623157e+308;
                                readonly maximum: 1.7976931348623157e+308;
                            };
                            readonly price: {
                                readonly type: "integer";
                                readonly format: "int32";
                                readonly minimum: -2147483648;
                                readonly maximum: 2147483647;
                            };
                            readonly rating: {
                                readonly type: "number";
                                readonly format: "double";
                                readonly minimum: -1.7976931348623157e+308;
                                readonly maximum: 1.7976931348623157e+308;
                            };
                            readonly related_places: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly parent: {};
                                };
                            };
                            readonly social_media: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly facebook_id: {
                                        readonly type: "string";
                                    };
                                    readonly instagram: {
                                        readonly type: "string";
                                    };
                                    readonly twitter: {
                                        readonly type: "string";
                                    };
                                };
                            };
                            readonly stats: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly total_photos: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                    readonly total_ratings: {
                                        readonly type: "integer";
                                        readonly format: "int64";
                                        readonly minimum: -9223372036854776000;
                                        readonly maximum: 9223372036854776000;
                                    };
                                    readonly total_tips: {
                                        readonly type: "integer";
                                        readonly format: "int32";
                                        readonly minimum: -2147483648;
                                        readonly maximum: 2147483647;
                                    };
                                };
                            };
                            readonly store_id: {
                                readonly type: "string";
                            };
                            readonly tastes: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "string";
                                };
                            };
                            readonly tel: {
                                readonly type: "string";
                            };
                            readonly timezone: {
                                readonly type: "string";
                            };
                            readonly tips: {
                                readonly type: "array";
                                readonly properties: {
                                    readonly traversable_again: {
                                        readonly type: "boolean";
                                    };
                                };
                                readonly items: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly id: {
                                            readonly type: "string";
                                        };
                                        readonly created_at: {
                                            readonly type: "string";
                                            readonly format: "date-time";
                                        };
                                        readonly text: {
                                            readonly type: "string";
                                        };
                                        readonly url: {
                                            readonly type: "string";
                                        };
                                        readonly photo: {};
                                        readonly lang: {
                                            readonly type: "string";
                                        };
                                        readonly agree_count: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                        readonly disagree_count: {
                                            readonly type: "integer";
                                            readonly format: "int32";
                                            readonly minimum: -2147483648;
                                            readonly maximum: 2147483647;
                                        };
                                    };
                                };
                            };
                            readonly venue_reality_bucket: {
                                readonly type: "string";
                            };
                            readonly verified: {
                                readonly type: "boolean";
                            };
                            readonly website: {
                                readonly type: "string";
                            };
                        };
                    };
                };
            };
            readonly $schema: "http://json-schema.org/draft-04/schema#";
        };
    };
};
export { AddressDetails, Autocomplete, FeedbackStatus, PlaceDetails, PlaceFlag, PlaceMatch, PlacePhotos, PlaceProposeEdit, PlaceSearch, PlaceSelect, PlaceTips, PlacesNearby };
