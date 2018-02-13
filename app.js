function submitQuery() {
  document.getElementById('executing').style.visibility = '';
  query(editor.getValue(), function(data) {
    document.getElementById('executing').style.visibility = 'hidden';
    drawResponse(data);
  });
}

var ws, global_tables, grid, db_host, current_database, editor;

$(function() {
  if (window.location.hash) {
    db_host = window.location.hash.replace('#', '');
  } else {
    db_host = prompt('Host:', 'http://127.0.0.1:8123/');
  }

  document.title = db_host + ' - ' + document.title;
  window.location.hash = db_host;
  reloadDatabases();

  $('#query').keydown(function(ev) {
    if ((ev.metaKey || ev.ctrlKey) && ev.keyCode == 13 /* Cmd+Enter */) {
      submitQuery();
      return false;
    }
  }).focus()

  $('#search').bind({keyup: filterTables, mouseup: filterTables});

  editor = ace.edit("query");
  editor.session.setMode("ace/mode/mysql");

  $('#query-result').on('dblclick', function(e) {
    var targ = e.target;
    for (var k in targ) {
      if (k.indexOf('__AG_') == 0) {
        drawCopyEl(targ, targ[k].cellComp.value);
      }
    }
  })
})

function drawResponse(data) {
  $('#query-ms').html(Math.floor(data['time_ns'] / 1000000))
  $('#affected-rows').html(humanRowsCount(data['affected_rows']))

  if (grid) {
    try {
      grid.destroy();
    } catch (e) {}
    grid = null;
  }

  document.querySelector('#query-result').innerHTML = '';

  if (data.err) {
    $('#query-result').html('<b>Error:</b> ' + data.err);
    return;
  }

  if (!data.fields.length) {
    $('#query-result').html('<i>Query executed successfully. Got empty resultset</i>');
    return;
  }

  var fields = data.fields;
  var rows = data.rows;

  var fullRows = [];
  var fullFields = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowAssoc = {};
    for (var j = 0; j < row.length; j++) {
      rowAssoc[fields[j]] = row[j];
    }
    fullRows.push(rowAssoc);
  }

  for (var i = 0; i < fields.length; i++) {
    fullFields.push({
      headerName: fields[i],
      field: fields[i],
    })
  }

  grid = new agGrid.Grid(document.querySelector('#query-result'), {
    columnDefs: fullFields,
    rowData: fullRows,
    enableColResize: true,
    singleClickEdit: true,
  });
}

function query(str, callback) {
  var xhr = new XMLHttpRequest();

  var params = "add_http_cors_header=1&log_queries=1&output_format_json_quote_64bit_integers=1&output_format_json_quote_denormals=1&database=" + current_database + "&result_overflow_mode=throw"

  xhr.open("POST", db_host + "/?" + params, true)
  xhr.onreadystatechange = function() {
    if (xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status === 200) {
          var res = JSON.parse(xhr.responseText);
          var fields = [];
          for (var i = 0; i < res.meta.length; i++) fields.push(res.meta[i].name);
          callback({
            fields: fields,
            rows: res.data,
            time_ns: res.statistics.elapsed * 1e9,
            affected_rows: res.statistics.rows_read,
          });
        }
    }
  }
  xhr.onerror = function() {
    callback({err: 'got status ' + xhr.status + ', error text: ' + xhr.responseText})
  }

  if ((str.indexOf('SELECT') >= 0 || str.indexOf('select') >= 0) && str.indexOf('limit') < 0 && str.indexOf('LIMIT') < 0) {
    str += "\nLIMIT 1000";
  }

  xhr.send(str + "\nFORMAT JSONCompact");
}

function drawCopyEl(el, value) {
  var off = $(el).offset();
  var el = document.createElement('textarea');
  el.value = value;
  el.style.position = 'absolute';
  el.style.top = off.top + 'px';
  el.style.left = off.left + 'px';
  el.style.zIndex = '10000';
  document.body.appendChild(el);
  el.focus();

  $(el).height(0);
  var height = Math.max(100, Math.min(el.scrollHeight, 500));
  $(el).height(height);
  if (height > 100) {
    el.style.top = (off.top - height + 100) + 'px';
  }

  el.onblur = function() {
    document.body.removeChild(el);
  }

  el.onkeydown = function(e) {
    if (e.keyCode == 27 /* Esc */) {
      document.body.removeChild(el);
    }
  }
}

function selectDatabase(val) {
  current_database = val;
  query("SHOW TABLES FROM " + current_database, function(data) {
    if (data.err) {
      alert(data.err);
      return;
    }

    global_tables = [];
    for (var i = 0; i < data.rows.length; i++) global_tables[i] = data.rows[i][0];
    drawTables(global_tables);

    $('#info').html('');
    $('#search').val('').focus();
  });
}

function reloadDatabases() {
  query("SHOW DATABASES", function(data) {
    if (data.err) {
      alert(data.err);
      return;
    }

    var init_default = false;
    var lst = ['<option value="">Select database...</option>'];
    for (var i = 0; i < data.rows.length; i++) {
      var name = data.rows[i][0];
      if (name == "default" && !current_database) {
        init_default = true;
      }
      lst.push('<option value="' + htmlspecialchars(name) + '"' + (init_default && name == "default" ? ' selected="selected"' : '') + '>' + htmlspecialchars(name) + '</option>');
    }

    $('#database').html(lst.join("\n"));

    if (init_default) {
      selectDatabase("default");
    }
  });
}

function filterTables() {
  var q = $('#search').val();
  var tables = []
  if (q == '') {
    tables = global_tables;
  } else {
    for (var i = 0; i < global_tables.length; i++) {
      if (global_tables[i].indexOf(q) != -1) tables.push(global_tables[i]);
    }
  }
  drawTables(tables);
}

function drawTables(tables) {
  var result = ['<ul class="nav nav-list"><li class="nav-header">Tables</li>'];
  for (var i = 0; i < tables.length; i++) {
    var name = htmlspecialchars(tables[i]);
    result.push('<li><a href="#" class="table_name" data-name="' + name + '"><i class="icon-th"></i>' + name + '</a></li>')
  }
  result.push('</ul>');
  $('#tables').html(result.join("\n")).find('.table_name').bind('click', function() {
    var name = $(this).data('name');
    var className = 'active';
    $('#tables').find('.' + className).removeClass(className);
    $(this.parentNode).addClass(className);
    
    var q = 'SELECT * FROM ' + current_database + "." + name + ' LIMIT 100';

    if ($('#query').val() == '') {
      query(q, drawResponse);
      $('#query').attr('placeholder', q);
    }

    query("SELECT\
    any(engine), sum(rows), sum(bytes)  \
    FROM system.parts WHERE database = '" + current_database + "' AND table = '" + name + "'", function(data) {
      if (data.err) {
        alert(data.err);
        return;
      }

      if (!data.rows || !data.rows[0]) {
        $('#info').html('');
        return;
      }

      var row = data.rows[0];

      $('#info').html(
        '<div><b>Engine:</b> ' + htmlspecialchars(row[0]) + '</div>' +
        '<div><b>Est. Rows:</b> ' + htmlspecialchars(humanRowsCount(row[1])) + '</div>' +
        '<div><b>Size:</b> ' + humanSize(row[2]) + '</div>'
      );
    });
    return false;
  });
}

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  if (bytes < 1024*1024) return Math.floor(bytes / 1024) + ' Kb';
  if (bytes < 1024*1024*1024) return Math.floor(bytes / 1024 / 1024) + ' Mb';
  return Math.floor(bytes / 1024 / 1024 / 1024) + ' Gb';
}

function humanRowsCount(cnt) {
  var suffix = '';
  while (cnt > 1000) {
    cnt /= 1000;
    suffix += 'k';
  }
  return Math.round(cnt * 100) / 100 + suffix;
}

function string_utf8_len(str) {
  var len = 0, l = str.length;

  for (var i = 0; i < l; i++) {
    var c = str.charCodeAt(i);
    if (c <= 0x0000007F) len++;
    else if (c >= 0x00000080 && c <= 0x000007FF) len += 2;
    else if (c >= 0x00000800 && c <= 0x0000FFFF) len += 3;
    else len += 4;
  }

  return len;
}

function indent(str) {
  str = '' + str
  while (str.length < 8) str += ' '
  return str
}

function htmlspecialchars (string, quote_style, charset, double_encode) {
  // http://kevin.vanzonneveld.net
  // +   original by: Mirek Slugen
  // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +   bugfixed by: Nathan
  // +   bugfixed by: Arno
  // +    revised by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +    bugfixed by: Brett Zamir (http://brett-zamir.me)
  // +      input by: Ratheous
  // +      input by: Mailfaker (http://www.weedem.fr/)
  // +      reimplemented by: Brett Zamir (http://brett-zamir.me)
  // +      input by: felix
  // +    bugfixed by: Brett Zamir (http://brett-zamir.me)
  // %        note 1: charset argument not supported
  // *     example 1: htmlspecialchars("<a href='test'>Test</a>", 'ENT_QUOTES');
  // *     returns 1: '&lt;a href=&#039;test&#039;&gt;Test&lt;/a&gt;'
  // *     example 2: htmlspecialchars("ab\"c'd", ['ENT_NOQUOTES', 'ENT_QUOTES']);
  // *     returns 2: 'ab"c&#039;d'
  // *     example 3: htmlspecialchars("my "&entity;" is still here", null, null, false);
  // *     returns 3: 'my &quot;&entity;&quot; is still here'
  var optTemp = 0,
    i = 0,
    noquotes = false;
  if (typeof quote_style === 'undefined' || quote_style === null) {
    quote_style = 2;
  }
  string = string !== undefined ? string.toString() : 'undefined';
  if (double_encode !== false) { // Put this first to avoid double-encoding
    string = string.replace(/&/g, '&amp;');
  }
  string = string.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  var OPTS = {
    'ENT_NOQUOTES': 0,
    'ENT_HTML_QUOTE_SINGLE': 1,
    'ENT_HTML_QUOTE_DOUBLE': 2,
    'ENT_COMPAT': 2,
    'ENT_QUOTES': 3,
    'ENT_IGNORE': 4
  };
  if (quote_style === 0) {
    noquotes = true;
  }
  if (typeof quote_style !== 'number') { // Allow for a single string or an array of string flags
    quote_style = [].concat(quote_style);
    for (i = 0; i < quote_style.length; i++) {
      // Resolve string input to bitwise e.g. 'ENT_IGNORE' becomes 4
      if (OPTS[quote_style[i]] === 0) {
        noquotes = true;
      }
      else if (OPTS[quote_style[i]]) {
        optTemp = optTemp | OPTS[quote_style[i]];
      }
    }
    quote_style = optTemp;
  }
  if (quote_style & OPTS.ENT_HTML_QUOTE_SINGLE) {
    string = string.replace(/'/g, '&#039;');
  }
  if (!noquotes) {
    string = string.replace(/"/g, '&quot;');
  }

  return string;
}