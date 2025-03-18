const sectionsData = require('../sections_data');
const { isNumeric } = require('../shared');

function organizePersonInterests(sections, myInterests, otherPersonInterests) {
    function setMatchData(
        section,
        item_token,
        match_types,
        table_key = null,
        name,
        favorite_position,
        secondary,
        importance,
        totals,
    ) {
        otherPersonInterests.matches.items[item_token] = {
            section: section.token,
            token: item_token,
            table_key: table_key,
            name: name,
            totals: totals,
            match: {
                types: match_types,
                mine: {
                    favorite: {
                        position: favorite_position?.mine || null,
                    },
                    secondary: secondary?.mine || null,
                    importance: importance?.mine || null,
                },
                theirs: {
                    favorite: {
                        position: favorite_position?.theirs || null,
                    },
                    secondary: secondary?.theirs || null,
                    importance: importance?.theirs || null,
                },
            },
        };
    }

    let myMergedItems = {};
    let theirMergedItems = {};

    for (let section of sections) {
        function calcPersonalTotals(myItem, theirItem) {
            //calc total number of items/favorited
            if (myItem && !myItem.deleted) {
                section_totals.mine.all++;

                if (myItem.is_favorite) {
                    section_totals.mine.favorite++;
                }
            }

            if (theirItem && !theirItem.deleted) {
                section_totals.theirs.all++;

                if (theirItem.is_favorite) {
                    section_totals.theirs.favorite++;
                }
            }
        }

        myMergedItems[section.token] = {};
        theirMergedItems[section.token] = {};

        let myItems = myInterests.sections[section.token] || {};
        let myFilter = myInterests.filters[section.token] || {};
        let theirItems = otherPersonInterests.sections[section.token] || {};
        let theirFilter = otherPersonInterests.filters[section.token] || {};

        //see if both our filters are enabled
        let myFilterEnabled = myFilter?.is_active && myFilter.is_send;
        let theirFilterEnabled = theirFilter?.is_active && theirFilter.is_receive;

        let section_totals = {
            mine: {
                all: 0,
                favorite: 0,
            },
            theirs: {
                all: 0,
                favorite: 0,
            },
        };

        //merge my personal/filter items
        for (let token in myItems) {
            if (!(token in myMergedItems[section.token])) {
                myMergedItems[section.token][token] = {
                    personal: null,
                    filter: null,
                };
            }

            myMergedItems[section.token][token].personal = myItems[token];
        }

        if (myFilter.items) {
            for (let k in myFilter.items) {
                let item = myFilter.items[k];

                if (!(item.token in myMergedItems[section.token])) {
                    myMergedItems[section.token][item.token] = {
                        personal: null,
                        filter: null,
                    };
                }

                myMergedItems[section.token][item.token].filter = item;
            }
        }

        //merge their personal/filter items
        for (let token in theirItems) {
            if (!(token in theirMergedItems[section.token])) {
                theirMergedItems[section.token][token] = {
                    personal: null,
                    filter: null,
                };
            }

            theirMergedItems[section.token][token].personal = theirItems[token];
        }

        if (theirFilter.items) {
            for (let k in theirFilter.items) {
                let item = theirFilter.items[k];

                if (!(item.token in theirMergedItems[section.token])) {
                    theirMergedItems[section.token][item.token] = {
                        personal: null,
                        filter: null,
                    };
                }

                theirMergedItems[section.token][item.token].filter = item;
            }
        }

        for (let item_token in myMergedItems[section.token]) {
            let myItem = myMergedItems[section.token][item_token];
            calcPersonalTotals(myItem?.personal);
        }

        for (let item_token in theirMergedItems[section.token]) {
            let theirItem = theirMergedItems[section.token][item_token];
            calcPersonalTotals(null, theirItem?.personal);
        }

        for (let item_token in myMergedItems[section.token]) {
            let myItem = myMergedItems[section.token][item_token];
            let theirItem = theirMergedItems[section.token][item_token];

            let isMyItem = myItem?.personal && !myItem.personal.deleted;
            let isTheirItem = theirItem?.personal && !theirItem.personal.deleted;
            let isMyFilter =
                myFilterEnabled &&
                myItem?.filter &&
                myItem.filter.is_active &&
                !myItem.filter.is_negative &&
                !myItem.filter.deleted;
            let isTheirFilter =
                theirFilterEnabled &&
                theirItem?.filter &&
                theirItem.filter.is_active &&
                !theirItem.filter.is_negative &&
                !theirItem.filter.deleted;

            // Only proceed if there's at least one type of match
            if (!(isMyItem || isTheirItem || isMyFilter || isTheirFilter)) {
                continue;
            }

            let matchTypes = {};

            if (isMyFilter) {
                matchTypes.my_filter = true;
            }

            if (isTheirFilter) {
                matchTypes.their_filter = true;
            }

            if (isMyItem) {
                matchTypes.my_item = true;
            }

            if (isTheirItem) {
                matchTypes.their_item = true;
            }

            let table_key =
                myItem?.personal?.table_key ||
                theirItem?.personal?.table_key ||
                myItem?.filter?.table_key ||
                theirItem?.filter?.table_key;
            let item_name =
                myItem?.personal?.name ||
                theirItem?.personal?.name ||
                myItem?.filter?.name ||
                theirItem?.filter?.name;

            if (
                Object.keys(matchTypes).length > 0 &&
                ((isMyItem && isTheirItem) ||
                    (isMyFilter && isTheirItem) ||
                    (isTheirFilter && isMyItem) ||
                    (isMyFilter && isTheirFilter))
            ) {
                setMatchData(
                    section,
                    item_token,
                    matchTypes,
                    table_key,
                    item_name,
                    {
                        mine: matchTypes.my_item ? myItem.personal.favorite_position : null,
                        theirs: matchTypes.their_item ? theirItem.personal.favorite_position : null,
                    },
                    {
                        mine: {
                            item: matchTypes.my_item ? myItem.personal.secondary || null : null,
                            filter: matchTypes.my_filter ? myItem.filter.secondary || null : null,
                        },
                        theirs: {
                            item: matchTypes.their_item
                                ? theirItem.personal.secondary || null
                                : null,
                            filter: matchTypes.their_filter
                                ? theirItem.filter.secondary || null
                                : null,
                        },
                    },
                    {
                        mine: matchTypes.my_filter ? myItem.filter.importance : null,
                        theirs: matchTypes.their_filter ? theirItem.filter.importance : null,
                    },
                    section_totals,
                );
            }
        }
    }
}

function calculateTotalScore(items) {
    let totalScore = 0;

    for (let item of items) {
        let score = getBaseScore(item);

        let importanceMultiplier = getImportanceMultiplier(item);
        let favoriteMultiplier = getFavoriteMultiplier(item);
        let secondaryMultiplier = getSecondaryMultiplier(item);

        let weightedScore = score * importanceMultiplier * favoriteMultiplier * secondaryMultiplier;

        item.score = weightedScore;

        totalScore += weightedScore;
    }

    return totalScore;
}

function getBaseScore(item) {
    let matchTypes = item.match.types;

    if (
        matchTypes.my_item &&
        matchTypes.their_item &&
        matchTypes.my_filter &&
        matchTypes.their_filter
    ) {
        return 50;
    }

    if (matchTypes.my_item && matchTypes.their_item) {
        if (matchTypes.my_filter || matchTypes.their_filter) {
            return 30;
        }

        return 15;
    }

    if (matchTypes.my_filter && matchTypes.their_item) {
        return 20;
    }

    if (matchTypes.their_filter && matchTypes.my_item) {
        return 15;
    }

    if (matchTypes.my_filter || matchTypes.their_filter) {
        return 10;
    }

    return 0;
}

function getImportanceMultiplier(item) {
    let importanceMultiplier = 1.0;
    let myImportance = item.match.mine?.importance;
    let theirImportance = item.match.theirs?.importance;

    if (myImportance && theirImportance) {
        let avgImportance = (myImportance + theirImportance) / 2;
        let base = 3;

        if (avgImportance >= 6 && avgImportance < 8) {
            base = 3.5;
        } else if (avgImportance >= 8 && avgImportance < 9) {
            base = 4;
        } else if (avgImportance >= 9 && avgImportance < 10) {
            base = 5.5;
        } else if (avgImportance >= 10) {
            base = 7;
        }

        importanceMultiplier = base;
    } else if (myImportance || theirImportance) {
        let importanceVal = myImportance || theirImportance;
        let base = 1;

        if (importanceVal >= 6 && importanceVal < 8) {
            base = 1.2;
        } else if (importanceVal >= 8 && importanceVal < 9) {
            base = 1.5;
        } else if (importanceVal >= 9 && importanceVal < 10) {
            base = 1.8;
        } else if (importanceVal >= 10) {
            base = 2.2;
        }

        importanceMultiplier = base;
    }

    return importanceMultiplier;
}

function getFavoriteMultiplier(item) {
    // Optimize matches based on total section items and favorite position
    let favoriteMultiplier = 1.0;

    let myFavoritePosition = item.match.mine?.favorite?.position;
    let theirFavoritePosition = item.match.theirs?.favorite?.position;

    if (myFavoritePosition !== null || theirFavoritePosition !== null) {
        let myTotal = item.totals.mine.all || 1;
        let theirTotal = item.totals.theirs.all || 1;
        let myFavorites = item.totals.mine.favorite || 0;
        let theirFavorites = item.totals.theirs.favorite || 0;
        let myPositionScore = myFavoritePosition ? (myTotal - myFavoritePosition + 1) / myTotal : 0;
        let theirPositionScore = theirFavoritePosition
            ? (theirTotal - theirFavoritePosition + 1) / theirTotal
            : 0;

        // Scale based on total items (more items = more significant favorites)
        let totalItemsMultiplier = 1;

        if (myPositionScore && theirPositionScore) {
            // Both have favorites - highest boost
            favoriteMultiplier = 4 * (myPositionScore + theirPositionScore);
            totalItemsMultiplier = Math.min((myTotal + theirTotal) / 4, 1);
        } else {
            // Single favorite - moderate boost
            favoriteMultiplier = 1.5 * (myPositionScore || theirPositionScore);

            if (myPositionScore) {
                totalItemsMultiplier = Math.min(myTotal / 6, 1);
            } else {
                totalItemsMultiplier = Math.min(theirTotal / 6, 1);
            }
        }

        favoriteMultiplier *= totalItemsMultiplier;
    }

    return favoriteMultiplier;
}

function getSecondaryMultiplier(item) {
    let secondaryMultiplier = 1.0;

    let itemSecondaryOptions =
        sectionsData?.[item.section]?.secondary?.[item.table_key]?.options || [];

    let myItemIndex = null;
    let theirItemIndex = null;
    let filterIncludesMe = false;
    let filterIncludesThem = false;

    if (itemSecondaryOptions) {
        if (item.match.mine?.secondary?.item) {
            myItemIndex = itemSecondaryOptions.indexOf(item.match.mine.secondary?.item);
        }

        if (item.match.theirs?.secondary?.item) {
            theirItemIndex = itemSecondaryOptions.indexOf(item.match.theirs.secondary?.item);
        }
    }

    if (item.match.theirs?.secondary?.filter && item.match.mine?.secondary?.item) {
        filterIncludesMe = item.match.theirs.secondary.filter.includes(
            item.match.mine.secondary.item,
        );
    }

    if (item.match.mine?.secondary?.filter && item.match.theirs?.secondary?.item) {
        filterIncludesThem = item.match.mine.secondary.filter.includes(
            item.match.theirs.secondary.item,
        );
    }

    if (item.match.mine?.secondary?.item && item.match.theirs?.secondary?.item) {
        let indexDiff = 0;

        if (isNumeric(myItemIndex) && isNumeric(theirItemIndex)) {
            indexDiff = Math.abs(myItemIndex - theirItemIndex);
            secondaryMultiplier =
                1 + itemSecondaryOptions.length / (indexDiff * itemSecondaryOptions.length + 1);
        }

        if (item.match.mine?.secondary?.filter && item.match.theirs?.secondary?.filter) {
            // Both item and filter
            if (filterIncludesMe && filterIncludesThem) {
                secondaryMultiplier *= 10;
            } else if (filterIncludesMe || filterIncludesThem) {
                secondaryMultiplier *= 5;
            } else {
                secondaryMultiplier *= 3;
            }
        } else if (item.match.mine?.secondary?.filter) {
            // Both items, my filter
            if (filterIncludesThem) {
                secondaryMultiplier *= 3;
            } else {
                secondaryMultiplier *= 1.5;
            }
        } else if (item.match.theirs?.secondary?.filter) {
            // Both items, their filter

            if (filterIncludesMe) {
                secondaryMultiplier *= 3;
            } else {
                secondaryMultiplier *= 1.5;
            }
        } else {
            secondaryMultiplier *= 1.2;
        }
    } else if (item.match.mine?.secondary?.item) {
        if (item.match.mine?.secondary?.filter && item.match.theirs?.secondary?.filter) {
            //Only my item, both filters
            if (filterIncludesMe) {
                secondaryMultiplier *= 5;
            } else {
                secondaryMultiplier *= 2;
            }
        } else if (item.match.mine?.secondary?.filter) {
            // My item, my filter
            secondaryMultiplier *= 1.5;
        } else if (item.match.theirs?.secondary?.filter) {
            // My item, their filter

            if (filterIncludesMe) {
                secondaryMultiplier *= 4;
            } else {
                secondaryMultiplier *= 1.5;
            }
        } else {
            // My item only

            secondaryMultiplier *= 1.2;
        }
    } else if (item.match.theirs?.secondary?.item) {
        if (item.match.mine?.secondary?.filter && item.match.theirs?.secondary?.filter) {
            // Their item, both filters
            if (filterIncludesThem) {
                secondaryMultiplier *= 5;
            } else {
                secondaryMultiplier *= 2;
            }
        } else if (item.match.mine?.secondary?.filter) {
            // Their item, my filter
            if (filterIncludesThem) {
                secondaryMultiplier *= 4;
            } else {
                secondaryMultiplier *= 1.5;
            }
        } else if (item.match.theirs?.secondary?.filter) {
            // Only their item, their filter
            secondaryMultiplier *= 1.5;
        } else {
            secondaryMultiplier *= 1.2;
        }
    } else {
        if (item.match.mine?.secondary?.filter && item.match.theirs?.secondary?.filter) {
            // No items exist, both filters
            secondaryMultiplier *= 1.3;
        } else if (item.match.mine?.secondary?.filter) {
            // No items, my filter
            secondaryMultiplier *= 1.1;
        } else if (item.match.theirs?.secondary?.filter) {
            // No items, their filter
            secondaryMultiplier *= 1.1;
        } else {
            secondaryMultiplier *= 1.0;
        }
    }

    return secondaryMultiplier;
}

module.exports = {
    interestScoreThresholds: {
        ultra: 200,
        super: 100,
    },
    organizePersonInterests,
    calculateTotalScore,
    getBaseScore,
    getImportanceMultiplier,
    getFavoriteMultiplier,
    getSecondaryMultiplier
};