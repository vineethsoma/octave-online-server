/*
 * Copyright © 2018, Octave Online LLC
 *
 * This file is part of Octave Online Server.
 *
 * Octave Online Server is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * Octave Online Server is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public
 * License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Octave Online Server.  If not, see
 * <https://www.gnu.org/licenses/>.
 */

"use strict";

const uuid = require("uuid");
const EventEmitter = require("events");
const log = require("@oo/shared").logger("maint-req-manager");
const config = require("@oo/shared").config;

class MaintenanceReuestManager extends EventEmitter {
	constructor() {
		super();
		this.reset();
	}

	reset() {
		this._priority = 0;
		this._responses = {};
	}

	beginRequestingMaintenance() {
		log.info("Beginning maintenance requests");
		this.reset();
		this._requestInterval = setInterval(this._requestMaintenance.bind(this), config.maintenance.requestInterval);
	}

	onMessage(id, isRequest, message) {
		let isOwnRequest = Object.keys(this._responses).indexOf(id) !== -1;

		if (isRequest && !isOwnRequest) {
			// Reply to the maintenance request.  Reply "yes" only if the requester's priority is higher than our own priority.
			let response = (message.priority > this._priority);
			this.emit("reply-to-maintenance-request", id, response);
		} else if (!isRequest && isOwnRequest) {
			// Someone replied to our own maintenance request.
			this._responses[id].push(message.response);
		}
	}

	stop() {
		if (this._requestInterval) clearInterval(this._requestInterval);
	}

	_requestMaintenance() {
		let id = uuid.v4();
		this._priority += 1;
		this._responses[id] = [];
		this.emit("request-maintenance", id, this._priority);
		log.trace("Sent maintenance request:", id, this._priority);

		setTimeout(() => {
			// Count the number of yeses and nos.
			let numYes = this._responses[id].reduce((s,v) => {
				return s + (v ? 1 : 0);
			}, 0);
			let numNo = this._responses[id].length - numYes;

			// Policy: Guarantee at least minNodesInCluster online nodes and no more than maxNodesInMaintenance maintenance nodes.
			let success = numNo < config.maintenance.maxNodesInMaintenance && numYes >= config.maintenance.minNodesInCluster;

			// Were we successful?
			if (success) {
				log.info("Maintenance request was approved");
				this.emit("maintenance-accepted");
				this._priority = Number.MAX_VALUE;
				clearInterval(this._requestInterval);
			}
			else {
				log.trace("Maintenance request failed; trying again:", id);
			}

			// Dereference responses array
			delete this._responses[id];
		}, config.maintenance.responseWaitTime);
	}
}

module.exports = MaintenanceReuestManager;
