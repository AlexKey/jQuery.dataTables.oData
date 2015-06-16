/// <reference path="_references.js" />
/**
 * @summary     DataTables OData addon
 * @description Enables jQuery DataTables plugin to read data from OData service.
 * @version     1.0.5
 * @file        jquery.dataTables.odata.js
 * @authors     Jovan & Vida Popovic
 *
 * @copyright Copyright 2014 Jovan & Vida Popovic, all rights reserved.
 *
 * This source file is free software, under either the GPL v2 license or a
 * BSD style license, available at:
 *   http://datatables.net/license_gpl2
 *   http://datatables.net/license_bsd
 * 
 * This source file is distributed in the hope that it will be useful, but 
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY 
 * or FITNESS FOR A PARTICULAR PURPOSE. See the license files for details.
 * 
 */

function fnServerOData(sUrl, aoData, fnCallback, oSettings, oCustomFilters) {

    var oParams = {};
    $.each(aoData, function (i, value) {
        oParams[value.name] = value.value;
    });

    var data = {
        "$format": "json"
    };

    // If OData service is placed on the another domain use JSONP.
    var bJSONP = oSettings.oInit.bUseODataViaJSONP;

    if (bJSONP) {
        data.$callback = "odatatable_" + (oSettings.oFeatures.bServerSide ? oParams.sEcho : ("load_" + Math.floor((Math.random() * 1000) + 1)));
    }

    $.each(oSettings.aoColumns, function (i, value) {
        var sFieldName = (value.sName !== null && value.sName !== "") ? value.sName : ((typeof value.mData === 'string') ? value.mData : null);
        if (sFieldName === null || !isNaN(Number(sFieldName))) {
            sFieldName = value.sTitle;
        }
        if (sFieldName === null || !isNaN(Number(sFieldName))) {
            return;
        }
        //if (value.bVisible || value.bKey)
        {
            if (data.$select == null) {
                data.$select = sFieldName;
            } else {
                data.$select += "," + sFieldName;
            }
        }
        
    });

    if (oSettings.oFeatures.bServerSide) {

        data.$skip = oSettings._iDisplayStart;
        if (oSettings._iDisplayLength > -1) {
            data.$top = oSettings._iDisplayLength;
        }

        // OData versions prior to v4 used $inlinecount=allpages; but v4 is uses $count=true
        if (oSettings.oInit.iODataVersion !== null && oSettings.oInit.iODataVersion < 4) {
            data.$inlinecount = "allpages";
        } else {
            data.$count = true;
        }

        var asFilters = [];
        var asColumnFilters = []; //used for jquery.dataTables.columnFilter.js
        $.each(oSettings.aoColumns,
            function (i, value) {

                var sFieldName = value.sName || value.mData;
                var columnFilter = oParams["sSearch_" + i]; //fortunately columnFilter's _number matches the index of aoColumns

                if ((oParams.sSearch !== null && oParams.sSearch !== "" || columnFilter !== null && columnFilter !== "") && value.bSearchable) {
                    switch (value.sType) {
                        case 'string':
                        case 'html':

                            if (oParams.sSearch) //!== null && oParams.sSearch !== "")
                            {
                                // asFilters.push("substringof('" + oParams.sSearch + "', " + sFieldName + ")");
                                // substringof does not work in v4???
                                asFilters.push("indexof(tolower(" + sFieldName + "), '" + oParams.sSearch.toLowerCase() + "') gt -1");
                            }

                            if (columnFilter) {
                                asColumnFilters.push("indexof(tolower(" + sFieldName + "), '" + columnFilter.toLowerCase() + "') gt -1");
                            }
                            break;

                        case 'date':
                        case 'numeric':
                            var fnFormatValue =
                                (value.sType == 'numeric') ?
                                    function (val) { return val; } :
                                    function (val) {
                                        // Here is a mess. OData V2, V3, and V4 se different formats of DateTime literals.
                                        switch (oSettings.oInit.iODataVersion) {
                                            // V2 works with the following format:
                                            // http://services.odata.org/V2/OData/OData.svc/Products?$filter=(ReleaseDate+lt+2014-04-29T09:00:00.000Z)                                                              
                                            case 4: return (new Date(val)).toISOString();
                                                // V3 works with the following format:
                                                // http://services.odata.org/V3/OData/OData.svc/Products?$filter=(ReleaseDate+lt+datetimeoffset'2008-01-01T07:00:00')
                                            case 3: return "datetimeoffset'" + (new Date(val)).toISOString() + "'";
                                                // V2 works with the following format:
                                                // http://services.odata.org/V2/OData/OData.svc/Products?$filter=(ReleaseDate+lt+DateTime'2014-04-29T09:00:00.000Z')
                                            case 2: return "DateTime'" + (new Date(val)).toISOString() + "'";
                                        }
                                    }

                            // Currently, we cannot use global search for date and numeric fields (exception on the OData service side)
                            // However, individual column filters are supported in form lower~upper
                            if (columnFilter && columnFilter !== null && columnFilter !== "" && columnFilter !== "~") {
                                asRanges = columnFilter.split("~");
                                if (asRanges[0] !== "") {
                                    asColumnFilters.push("(" + sFieldName + " gt " + fnFormatValue(asRanges[0]) + ")");
                                }

                                if (asRanges[1] !== "") {
                                    asColumnFilters.push("(" + sFieldName + " lt " + fnFormatValue(asRanges[1]) + ")");
                                }
                            }
                            break;
                        default:
                    }
                }
            });

        if (asFilters.length > 0) {
            data.$filter = asFilters.join(" or ");
        }

        if (asColumnFilters.length > 0) {
            if (data.$filter !== undefined) {
                data.$filter = " ( " + data.$filter + " ) and ( " + asColumnFilters.join(" and ") + " ) ";
            } else {
                data.$filter = asColumnFilters.join(" and ");
            }
        }
        var formatPredicateValue = function (predicateColumn, predicateValue) {
            var formattedValue = '';
            switch (predicateColumn.sType) {
                case 'string':
                case 'html':
                    formattedValue = "'" + $.trim(predicateValue) + "'";
                    break;
                case 'numeric':
                case 'date':
                    formattedValue = predicateValue
                    break;
            }
            return formattedValue;
        }

        if (oCustomFilters.length > 0) {
            debugger;
            var customFilter = [];
            $.each(oCustomFilters, function (index, filter) {
                var oDataPredicateColumn = filter.PredicateColumn.mData;
                var oDataPredicateOperand = '';
                var oDataPredicateValue = formatPredicateValue(filter.PredicateColumn, filter.PredicateValue);

                var oDataFilterOperand = '';                
                if (filter.FilterOperand.op)
                    oDataFilterOperand = filter.FilterOperand.op.toLowerCase();
                else
                    oDataFilterOperand = 'and'; 
                if (index == oCustomFilters.length - 1)
                    oDataFilterOperand = '';//last condition

                var formattedSearchCondition = '';
                var bIsFunction = false;
                switch (filter.PredicateOperand.op) {
                    case 'Equals':
                        oDataPredicateOperand = 'eq';
                        break;
                    case 'Greator than':
                        oDataPredicateOperand = 'gt';
                        break;
                    case 'Greator than Or equal to':
                        oDataPredicateOperand = 'ge';
                        break;
                    case 'Less than':
                        oDataPredicateOperand = 'lt';
                        break;
                    case 'Less than or equal to':
                        oDataPredicateOperand = 'le';
                        break;
                    case 'Starts with':
                        formattedSearchCondition = "startswith(" + oDataPredicateColumn + "," + oDataPredicateValue + ") eq true";
                        bIsFunction = true;
                        break;
                    case 'End with':
                        formattedSearchCondition = "endswith(" + oDataPredicateColumn + "," + oDataPredicateValue + ") eq true";
                        bIsFunction = true;
                        break;
                    case 'Contains':
                    	//Update for odata v4
                        //formattedSearchCondition = "substring(" + oDataPredicateColumn + ",1) eq " + oDataPredicateValue + "";
                        formattedSearchCondition = "contains(" + oDataPredicateColumn + "," + "" +oDataPredicateValue + ""+ ")";
                        bIsFunction = true;
                        break;
                    //default:
                    //    if (filter.PredicateColumn.sType == 'string')
                    //        oDataPredicateOperand = 'eq';
                }
                if (bIsFunction == false) {
                    formattedSearchCondition = oDataPredicateColumn + ' ' + oDataPredicateOperand + ' ' + oDataPredicateValue;
                }
                formattedSearchCondition = formattedSearchCondition + ' ' + oDataFilterOperand;
                bIsFunction = false;
                customFilter.push(formattedSearchCondition);
            });
            if (customFilter.length > 0)
                data.$filter = customFilter.join(" ");
        }

        var asOrderBy = [];
        for (var i = 0; i < oParams.iSortingCols; i++) {
            asOrderBy.push(oParams["mDataProp_" + oParams["iSortCol_" + i]] + " " + (oParams["sSortDir_" + i] || ""));
        }

        if (asOrderBy.length > 0) {
            data.$orderby = asOrderBy.join();
        }
    }
    $.ajax(jQuery.extend({}, oSettings.oInit.ajax, {
        "url": sUrl,
        "data": data,
        "jsonp": bJSONP,
        "dataType": bJSONP ? "jsonp" : "json",
        "jsonpCallback": data["$callback"],
        "cache": false,
        "success": function (data) {
            var oDataSource = {};

            // Probe data structures for V4, V3, and V2 versions of OData response
            oDataSource.aaData = data.value || (data.d && data.d.results) || data.d || data.Items || data;
            var iCount = (data["TotalCount"]) ? data["TotalCount"] : ((data["odata.count"]) ? data["odata.count"] : ((data.__count) ? data.__count : (data.d && data.d.__count)));

            if (iCount == null) {
                if (oDataSource.aaData.length === oSettings._iDisplayLength) {
                    oDataSource.iTotalRecords = oSettings._iDisplayStart + oSettings._iDisplayLength + 1;
                } else {
                    oDataSource.iTotalRecords = oSettings._iDisplayStart + oDataSource.aaData.length;
                }
            } else {
                oDataSource.iTotalRecords = iCount;
            }

            oDataSource.iTotalDisplayRecords = oDataSource.iTotalRecords;

            fnCallback(oDataSource);
        }
    }));

} // end fnServerData
